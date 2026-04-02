package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/fran-soria/motorisk/internal/api"
	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL no definida")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	ctx := context.Background()

	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		log.Fatalf("Error conectando a la base de datos: %v", err)
	}
	defer conn.Close(ctx)

	srv := api.NewServer(conn)

	log.Printf("Servidor escuchando en :%s", port)
	if err := http.ListenAndServe(":"+port, srv.Routes()); err != nil {
		log.Fatal(err)
	}
}
