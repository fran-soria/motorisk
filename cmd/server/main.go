package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/fran-soria/motorisk/internal/api"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("warn: no se pudo cargar .env: %v", err)
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL no definida")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Error conectando a la base de datos: %v", err)
	}
	defer pool.Close()

	osrmURL := os.Getenv("OSRM_URL")
	if osrmURL == "" {
		log.Fatal("OSRM_URL no definida")
	}

	srv := api.NewServer(pool, osrmURL)

	log.Printf("Servidor escuchando en :%s", port)
	if err := http.ListenAndServe(":"+port, srv.Routes()); err != nil {
		log.Fatal(err)
	}
}
