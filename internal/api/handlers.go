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
	Hourly struct {
		WindSpeed10m     []float64 `json:"windspeed_10m"`
		WindDirection10m []float64 `json:"winddirection_10m"`
		Precipitation    []float64 `json:"precipitation"`
		Visibility       []float64 `json:"visibility"`
	} `json:"hourly"`
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
		Date        string       `json:"date,omitempty"`
		Hour        int          `json:"hour,omitempty"`
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
	var url string
	if body.Date != "" {
		url = fmt.Sprintf(
			"https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&hourly=windspeed_10m,winddirection_10m,precipitation,visibility&wind_speed_unit=kmh&start_date=%s&end_date=%s",
			strings.Join(lats, ","), strings.Join(lons, ","),
			body.Date, body.Date,
		)
	} else {
		url = fmt.Sprintf(
			"https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=windspeed_10m,winddirection_10m,precipitation,visibility&wind_speed_unit=kmh",
			strings.Join(lats, ","), strings.Join(lons, ","),
		)
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)
	if err != nil {
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if r.Context().Err() != nil {
			return
		}
		http.Error(w, "error consultando Open-Meteo", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Sprintf("Open-Meteo devolvió %d", resp.StatusCode), http.StatusBadGateway)
		return
	}

	var locations []openMeteoLocation
	if err := json.NewDecoder(resp.Body).Decode(&locations); err != nil {
		http.Error(w, "error procesando respuesta meteorológica", http.StatusBadGateway)
		return
	}

	if len(locations) != len(pts) {
		http.Error(w, "respuesta meteorológica incompleta", http.StatusBadGateway)
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
		var windSpd, windDir, prec, vis float64
		if body.Date != "" {
			windSpd = loc.Hourly.WindSpeed10m[body.Hour]
			windDir = loc.Hourly.WindDirection10m[body.Hour]
			prec    = loc.Hourly.Precipitation[body.Hour]
			vis     = loc.Hourly.Visibility[body.Hour] / 1000
		} else {
			windSpd = loc.Current.WindSpeed10m
			windDir = loc.Current.WindDirection10m
			prec    = loc.Current.Precipitation
			vis     = loc.Current.Visibility / 1000
		}
		pt := weatherPoint{
			RouteKm:          km,
			Lat:              pts[i][1],
			Lon:              pts[i][0],
			WindSpeedKmh:     windSpd,
			WindDirectionDeg: windDir,
			PrecipitationMm:  prec,
			VisibilityKm:     vis,
		}
		pt.Alert = pt.WindSpeedKmh > 50 || pt.PrecipitationMm > 0.5 || pt.VisibilityKm < 1.0
		result[i] = pt
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

type elevationPoint struct {
	RouteKm    float64 `json:"route_km"`
	Lat        float64 `json:"lat"`
	Lon        float64 `json:"lon"`
	ElevationM float64 `json:"elevation_m"`
}

type openMeteoElevation struct {
	Elevation []float64 `json:"elevation"`
}

func (s *Server) handleElevation(w http.ResponseWriter, r *http.Request) {
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

	coords := body.Coordinates
	step := len(coords) / 60
	if step < 1 {
		step = 1
	}
	sampled := make([][2]float64, 0)
	for i, c := range coords {
		if i%step == 0 {
			sampled = append(sampled, c)
		}
	}
	last := coords[len(coords)-1]
	if sampled[len(sampled)-1] != last {
		sampled = append(sampled, last)
	}

	lats := make([]string, len(sampled))
	lons := make([]string, len(sampled))
	for i, c := range sampled {
		lats[i] = fmt.Sprintf("%f", c[1])
		lons[i] = fmt.Sprintf("%f", c[0])
	}

	url := fmt.Sprintf(
		"https://api.open-meteo.com/v1/elevation?latitude=%s&longitude=%s",
		strings.Join(lats, ","),
		strings.Join(lons, ","),
	)

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)
	if err != nil {
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if r.Context().Err() != nil {
			return
		}
		http.Error(w, "error consultando Open-Meteo elevation", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Sprintf("Open-Meteo elevation devolvió %d", resp.StatusCode), http.StatusBadGateway)
		return
	}

	var elev openMeteoElevation
	if err := json.NewDecoder(resp.Body).Decode(&elev); err != nil {
		http.Error(w, "error procesando respuesta de elevación", http.StatusBadGateway)
		return
	}

	if len(elev.Elevation) != len(sampled) {
		http.Error(w, "respuesta de elevación incompleta", http.StatusBadGateway)
		return
	}

	routeKms := make([]float64, len(sampled))
	for i := 1; i < len(sampled); i++ {
		routeKms[i] = routeKms[i-1] + haversineKm(sampled[i-1][1], sampled[i-1][0], sampled[i][1], sampled[i][0])
	}

	result := make([]elevationPoint, len(sampled))
	for i, c := range sampled {
		km := math.Round(routeKms[i]*10) / 10
		result[i] = elevationPoint{
			RouteKm:    km,
			Lat:        c[1],
			Lon:        c[0],
			ElevationM: elev.Elevation[i],
		}
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
