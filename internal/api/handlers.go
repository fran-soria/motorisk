package api

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
)

type segmentResponse struct {
	ID        string          `json:"id"`
	Road      string          `json:"road"`
	Province  string          `json:"province"`
	Direction string          `json:"direction"`
	LengthM   float64         `json:"length_m"`
	PKStart   float64         `json:"pk_start"`
	PKEnd     float64         `json:"pk_end"`
	GeoJSON   json.RawMessage `json:"geojson"`
}

type weatherPoint struct {
	RouteKm          float64 `json:"route_km"`
	Lat              float64 `json:"lat"`
	Lon              float64 `json:"lon"`
	WindSpeedKmh     float64 `json:"wind_speed_kmh"`
	WindDirectionDeg float64 `json:"wind_direction_deg"`
	PrecipitationMm  float64 `json:"precipitation_mm"`
	VisibilityKm     float64 `json:"visibility_km"`
	Alert            bool    `json:"alert"`
}

type openMeteoLocation struct {
	Current struct {
		WindSpeed10m     float64 `json:"windspeed_10m"`
		WindDirection10m float64 `json:"winddirection_10m"`
		Precipitation    float64 `json:"precipitation"`
		Visibility       float64 `json:"visibility"`
	} `json:"current"`
}

// haversineKm returns the great-circle distance in km between two lat/lon points.
func haversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// sampleCoords returns between 2 and 10 equidistant sample points along the route.
// coords are [lon, lat] pairs (GeoJSON order).
func sampleCoords(coords [][2]float64) [][2]float64 {
	if len(coords) < 2 {
		return coords
	}
	total := 0.0
	for i := 1; i < len(coords); i++ {
		total += haversineKm(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0])
	}

	n := int(total/50) + 1
	if n < 2 {
		n = 2
	}
	if n > 10 {
		n = 10
	}

	result := make([][2]float64, 0, n)
	result = append(result, coords[0])

	interval := total / float64(n-1)
	accumulated := 0.0
	nextTarget := interval
	for i := 1; i < len(coords); i++ {
		d := haversineKm(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0])
		accumulated += d
		for accumulated >= nextTarget-1e-9 && len(result) < n-1 {
			result = append(result, coords[i])
			nextTarget += interval
		}
	}

	last := coords[len(coords)-1]
	if result[len(result)-1] != last {
		result = append(result, last)
	}
	return result
}

func (s *Server) handleWeather(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Coordinates [][2]float64 `json:"coordinates"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "body inválido", http.StatusBadRequest)
		return
	}
	if len(body.Coordinates) < 2 {
		http.Error(w, "la ruta necesita al menos 2 puntos", http.StatusBadRequest)
		return
	}

	pts := sampleCoords(body.Coordinates)

	lats := make([]string, len(pts))
	lons := make([]string, len(pts))
	for i, pt := range pts {
		lats[i] = fmt.Sprintf("%f", pt[1]) // lat
		lons[i] = fmt.Sprintf("%f", pt[0]) // lon
	}
	url := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=windspeed_10m,winddirection_10m,precipitation,visibility&wind_speed_unit=kmh",
		strings.Join(lats, ","),
		strings.Join(lons, ","),
	)

	resp, err := http.Get(url) //nolint:noctx
	if err != nil {
		http.Error(w, "error consultando Open-Meteo", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	var locations []openMeteoLocation
	if err := json.NewDecoder(resp.Body).Decode(&locations); err != nil {
		http.Error(w, "error procesando respuesta meteorológica", http.StatusBadGateway)
		return
	}

	// Compute accumulated distance along the sampled points.
	routeKms := make([]float64, len(pts))
	for i := 1; i < len(pts); i++ {
		routeKms[i] = routeKms[i-1] + haversineKm(pts[i-1][1], pts[i-1][0], pts[i][1], pts[i][0])
	}
	total := routeKms[len(routeKms)-1]
	routeKms[len(routeKms)-1] = math.Round(total*10) / 10 // snap last to rounded total

	result := make([]weatherPoint, len(locations))
	for i, loc := range locations {
		km := math.Round(routeKms[i]*10) / 10
		pt := weatherPoint{
			RouteKm:          km,
			Lat:              pts[i][1],
			Lon:              pts[i][0],
			WindSpeedKmh:     loc.Current.WindSpeed10m,
			WindDirectionDeg: loc.Current.WindDirection10m,
			PrecipitationMm:  loc.Current.Precipitation,
			VisibilityKm:     loc.Current.Visibility / 1000,
		}
		pt.Alert = pt.WindSpeedKmh > 50 || pt.PrecipitationMm > 0.5 || pt.VisibilityKm < 1.0
		result[i] = pt
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleRoute(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Coordinates [][2]float64 `json:"coordinates"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "body inválido", http.StatusBadRequest)
		return
	}

	if len(body.Coordinates) < 2 {
		http.Error(w, "la ruta necesita al menos 2 puntos", http.StatusBadRequest)
		return
	}

	segments, err := s.queryRoute(r.Context(), body.Coordinates)
	if err != nil {
		http.Error(w, "error consultando base de datos", http.StatusInternalServerError)
		return
	}

	response := make([]segmentResponse, len(segments))
	for i, seg := range segments {
		response[i] = segmentResponse{
			ID:        seg.ID,
			Road:      seg.Road,
			Province:  seg.Province,
			Direction: seg.Direction,
			LengthM:   seg.LengthM,
			PKStart:   seg.PKStart,
			PKEnd:     seg.PKEnd,
			GeoJSON:   json.RawMessage(seg.GeoJSON),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
