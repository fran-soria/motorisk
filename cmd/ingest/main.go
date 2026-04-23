package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/fran-soria/motorisk/internal/datex2"
	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

const createTable = `
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS risk_segments (
	id        TEXT PRIMARY KEY,
	road      TEXT,
	province  TEXT,
	direction TEXT,
	length_m  FLOAT,
	pk_start  FLOAT,
	pk_end    FLOAT,
	geom      GEOMETRY(LINESTRING, 4326)
);

CREATE INDEX IF NOT EXISTS risk_segments_geom_idx
	ON risk_segments USING GIST (geom);
`

const insertSegment = `
INSERT INTO risk_segments (id, road, province, direction, length_m, pk_start, pk_end, geom)
VALUES (
	$1, $2, $3, $4, $5, $6, $7,
	ST_SetSRID(ST_GeomFromGeoJSON($8), 4326)
)
ON CONFLICT (id) DO UPDATE SET geom = EXCLUDED.geom;
`

const dgtURL = "https://infocar.dgt.es/datex2/dgt/PredefinedLocationsPublication/tramosriesgomotos/content.xml"

type osrmResponse struct {
	Code   string `json:"code"`
	Routes []struct {
		Geometry json.RawMessage `json:"geometry"`
	} `json:"routes"`
}

var httpClient = &http.Client{Timeout: 30 * time.Second}

func fetchRoadGeometry(osrmURL string, fromLon, fromLat, toLon, toLat float64) (json.RawMessage, error) {
	url := fmt.Sprintf("%s/route/v1/driving/%f,%f;%f,%f?geometries=geojson&overview=full",
		osrmURL, fromLon, fromLat, toLon, toLat)

	resp, err := httpClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result osrmResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if result.Code != "Ok" || len(result.Routes) == 0 {
		return nil, fmt.Errorf("osrm no encontró ruta para %f,%f -> %f,%f", fromLon, fromLat, toLon, toLat)
	}

	return result.Routes[0].Geometry, nil
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("warn: no se pudo cargar .env: %v", err)
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL no definida")
	}

	osrmURL := os.Getenv("OSRM_URL")
	if osrmURL == "" {
		log.Fatal("OSRM_URL no definida")
	}
	osrmURL = strings.TrimRight(osrmURL, "/")

	ctx := context.Background()

	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		log.Fatalf("error conectando a la base de datos: %v", err)
	}
	defer conn.Close(ctx)

	if _, err := conn.Exec(ctx, createTable); err != nil {
		log.Fatalf("error creando tabla: %v", err)
	}

	resp, err := httpClient.Get(dgtURL)
	if err != nil {
		log.Fatalf("error descargando datos DGT: %v", err)
	}
	defer resp.Body.Close()

	segments, err := datex2.Parse(resp.Body)
	if err != nil {
		log.Fatalf("error parseando DATEX2: %v", err)
	}

	fmt.Printf("Tramos parseados: %d\n", len(segments))

	inserted := 0
	failed := 0
	for _, s := range segments {
		geom, err := fetchRoadGeometry(osrmURL, s.FromLon, s.FromLat, s.ToLon, s.ToLat)
		if err != nil {
			log.Printf("warn: no se pudo obtener geometría para %s: %v", s.ID, err)
			failed++
			continue
		}

		_, err = conn.Exec(ctx, insertSegment,
			s.ID, s.Road, s.Province, s.Direction,
			s.LengthM, s.PKStart, s.PKEnd,
			string(geom),
		)
		if err != nil {
			log.Printf("warn: error insertando segmento %s: %v", s.ID, err)
			failed++
			continue
		}
		inserted++
	}

	fmt.Printf("Tramos insertados/actualizados: %d\n", inserted)
	if failed > 0 {
		fmt.Printf("Tramos sin geometría OSRM: %d\n", failed)
	}
}
