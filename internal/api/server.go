package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/fran-soria/motorisk/internal/datex2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	db         *pgxpool.Pool
	cache      *Cache
	osrmURL    string
	httpClient *http.Client
	corsOrigin string
}

func NewServer(db *pgxpool.Pool, osrmURL, corsOrigin string) *Server {
	return &Server{
		db:         db,
		cache:      NewCache(),
		osrmURL:    strings.TrimRight(osrmURL, "/"),
		httpClient: &http.Client{Timeout: 15 * time.Second},
		corsOrigin: corsOrigin,
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("POST /route/segments", s.handleRoute)
	mux.HandleFunc("POST /route/weather", s.handleWeather)
	mux.HandleFunc("POST /route/elevation", s.handleElevation)
	mux.HandleFunc("POST /route/snap", s.handleSnap)
	mux.HandleFunc("POST /route/geometry", s.handleGeometry)
	mux.HandleFunc("POST /route/geocode", s.handleGeocode)
	mux.HandleFunc("POST /route/reverse", s.handleReverse)
	return s.corsMiddleware(mux)
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", s.corsOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) queryRoute(ctx context.Context, coords [][2]float64) ([]datex2.Segment, error) {
	points := make([]string, len(coords))
	for i, c := range coords {
		points[i] = fmt.Sprintf("%f %f", c[0], c[1])
	}
	linestring := fmt.Sprintf("LINESTRING(%s)", strings.Join(points, ","))

	const q = `
		SELECT id, road, province, direction, length_m, pk_start, pk_end,
			ST_AsGeoJSON(geom)
		FROM risk_segments
		WHERE ST_Intersects(
			geom,
			ST_SetSRID(ST_GeomFromText($1), 4326)
		)
	`

	rows, err := s.db.Query(ctx, q, linestring)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var segments []datex2.Segment
	for rows.Next() {
		var seg datex2.Segment
		if err := rows.Scan(
			&seg.ID, &seg.Road, &seg.Province, &seg.Direction,
			&seg.LengthM, &seg.PKStart, &seg.PKEnd,
			&seg.GeoJSON,
		); err != nil {
			return nil, err
		}
		segments = append(segments, seg)
	}

	return segments, rows.Err()
}
