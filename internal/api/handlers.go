package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"
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
		Hour        *int         `json:"hour,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "body inválido", http.StatusBadRequest)
		return
	}
	if len(body.Coordinates) < 2 {
		http.Error(w, "la ruta necesita al menos 2 puntos", http.StatusBadRequest)
		return
	}
	if body.Date != "" {
		if body.Hour == nil {
			http.Error(w, "hour es obligatorio cuando se especifica date", http.StatusBadRequest)
			return
		}
		if *body.Hour < 0 || *body.Hour > 23 {
			http.Error(w, "hour debe estar entre 0 y 23", http.StatusBadRequest)
			return
		}
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

	cacheKey := CacheKey("weather", []byte(url))
	if cached, ok := s.cache.Get(cacheKey); ok {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)
	if err != nil {
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	resp, err := s.httpClient.Do(req)
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
			h := *body.Hour
			if h >= len(loc.Hourly.WindSpeed10m) || h >= len(loc.Hourly.WindDirection10m) ||
				h >= len(loc.Hourly.Precipitation) || h >= len(loc.Hourly.Visibility) {
				http.Error(w, "Open-Meteo devolvió menos datos de los esperados", http.StatusBadGateway)
				return
			}
			windSpd = loc.Hourly.WindSpeed10m[h]
			windDir = loc.Hourly.WindDirection10m[h]
			prec    = loc.Hourly.Precipitation[h]
			vis     = loc.Hourly.Visibility[h] / 1000
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

	encoded, err := json.Marshal(result)
	if err != nil {
		http.Error(w, "error serializando respuesta", http.StatusInternalServerError)
		return
	}
	s.cache.Set(cacheKey, encoded, 10*time.Minute)
	w.Header().Set("Content-Type", "application/json")
	w.Write(encoded)
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

	cacheKey := CacheKey("elevation", []byte(url))
	if cached, ok := s.cache.Get(cacheKey); ok {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)
	if err != nil {
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	resp, err := s.httpClient.Do(req)
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

	encoded, err := json.Marshal(result)
	if err != nil {
		http.Error(w, "error serializando respuesta", http.StatusInternalServerError)
		return
	}
	s.cache.Set(cacheKey, encoded, NoExpiry)
	w.Header().Set("Content-Type", "application/json")
	w.Write(encoded)
}

type snapResponse struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

type geometryResponse struct {
	Coordinates [][]float64 `json:"coordinates"`
	Distance    float64     `json:"distance"`
}

type osrmNearestResponse struct {
	Code      string `json:"code"`
	Waypoints []struct {
		Location [2]float64 `json:"location"`
	} `json:"waypoints"`
}

type osrmRouteResponse struct {
	Code   string `json:"code"`
	Routes []struct {
		Distance float64 `json:"distance"`
		Geometry struct {
			Coordinates [][]float64 `json:"coordinates"`
		} `json:"geometry"`
	} `json:"routes"`
}

func (s *Server) handleSnap(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Lat float64 `json:"lat"`
		Lon float64 `json:"lon"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "body inválido", http.StatusBadRequest)
		return
	}

	snapURL := fmt.Sprintf("%s/nearest/v1/driving/%f,%f", s.osrmURL, body.Lon, body.Lat)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, snapURL, nil)
	if err != nil {
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		if r.Context().Err() != nil {
			return
		}
		http.Error(w, "error consultando OSRM", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	var result osrmNearestResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		http.Error(w, "error procesando respuesta OSRM", http.StatusBadGateway)
		return
	}

	if result.Code != "Ok" || len(result.Waypoints) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(snapResponse{Lat: body.Lat, Lon: body.Lon})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snapResponse{
		Lat: result.Waypoints[0].Location[1],
		Lon: result.Waypoints[0].Location[0],
	})
}

func (s *Server) handleGeometry(w http.ResponseWriter, r *http.Request) {
	var body struct {
		From [2]float64 `json:"from"` // [lat, lon]
		To   [2]float64 `json:"to"`   // [lat, lon]
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "body inválido", http.StatusBadRequest)
		return
	}

	geometryURL := fmt.Sprintf("%s/route/v1/driving/%f,%f;%f,%f?geometries=geojson&overview=full",
		s.osrmURL, body.From[1], body.From[0], body.To[1], body.To[0])

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, geometryURL, nil)
	if err != nil {
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		if r.Context().Err() != nil {
			return
		}
		http.Error(w, "error consultando OSRM", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	var result osrmRouteResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		http.Error(w, "error procesando respuesta OSRM", http.StatusBadGateway)
		return
	}

	if result.Code != "Ok" || len(result.Routes) == 0 {
		http.Error(w, "OSRM no encontró ruta", http.StatusUnprocessableEntity)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(geometryResponse{
		Coordinates: result.Routes[0].Geometry.Coordinates,
		Distance:    result.Routes[0].Distance,
	})
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

// ── Photon types ────────────────────────────────────────────────────────────

type photonFeature struct {
	Geometry struct {
		Coordinates [2]float64 `json:"coordinates"` // [lon, lat]
	} `json:"geometry"`
	Properties struct {
		Name        string `json:"name"`
		Street      string `json:"street"`
		Housenumber string `json:"housenumber"`
		City        string `json:"city"`
		State       string `json:"state"`
		CountryCode string `json:"countrycode"`
	} `json:"properties"`
}

type photonResponse struct {
	Features []photonFeature `json:"features"`
}

type geocodeCandidate struct {
	Address string  `json:"address"`
	Lat     float64 `json:"lat"`
	Lon     float64 `json:"lon"`
}

func formatPhotonAddress(f photonFeature) string {
	p := f.Properties
	var parts []string
	if p.Name != "" {
		// Named POI or place: name + city (street adds noise)
		parts = append(parts, p.Name)
	} else {
		// Unnamed address: street + housenumber
		street := p.Street
		if p.Housenumber != "" && street != "" {
			street = street + " " + p.Housenumber
		}
		if street != "" {
			parts = append(parts, street)
		}
	}
	if p.City != "" {
		parts = append(parts, p.City)
	} else if p.State != "" {
		parts = append(parts, p.State)
	}
	return strings.Join(parts, ", ")
}

func callPhoton(ctx context.Context, client *http.Client, url string) (*photonResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "motorisk/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var result photonResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ── Handlers ─────────────────────────────────────────────────────────────────

func (s *Server) handleGeocode(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Q     string `json:"q"`
		Limit int    `json:"limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "body inválido", http.StatusBadRequest)
		return
	}
	if body.Limit <= 0 {
		body.Limit = 6
	}

	params := url.Values{}
	params.Set("q", body.Q)
	params.Set("limit", fmt.Sprintf("%d", body.Limit))
	params.Set("bbox", "-18.2,27.6,4.4,43.8")
	geocodeURL := "https://photon.komoot.io/api/?" + params.Encode()

	cacheKey := CacheKey("geocode", []byte(geocodeURL))
	if cached, ok := s.cache.Get(cacheKey); ok {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}

	photon, err := callPhoton(r.Context(), s.httpClient, geocodeURL)
	if err != nil {
		if r.Context().Err() != nil {
			return
		}
		http.Error(w, "error consultando Photon", http.StatusBadGateway)
		return
	}

	candidates := make([]geocodeCandidate, 0, len(photon.Features))
	for _, f := range photon.Features {
		if f.Properties.CountryCode != "ES" {
			continue
		}
		addr := formatPhotonAddress(f)
		if addr == "" {
			continue
		}
		candidates = append(candidates, geocodeCandidate{
			Address: addr,
			Lat:     f.Geometry.Coordinates[1],
			Lon:     f.Geometry.Coordinates[0],
		})
	}

	encoded, err := json.Marshal(candidates)
	if err != nil {
		http.Error(w, "error serializando respuesta", http.StatusInternalServerError)
		return
	}
	s.cache.Set(cacheKey, encoded, 5*time.Minute)
	w.Header().Set("Content-Type", "application/json")
	w.Write(encoded)
}

func (s *Server) handleReverse(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Lat float64 `json:"lat"`
		Lon float64 `json:"lon"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "body inválido", http.StatusBadRequest)
		return
	}

	url := fmt.Sprintf("https://photon.komoot.io/reverse?lat=%f&lon=%f", body.Lat, body.Lon)

	photon, err := callPhoton(r.Context(), s.httpClient, url)
	if err != nil {
		if r.Context().Err() != nil {
			return
		}
		http.Error(w, "error consultando Photon", http.StatusBadGateway)
		return
	}

	address := ""
	if len(photon.Features) > 0 {
		address = formatPhotonAddress(photon.Features[0])
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"address": address})
}
