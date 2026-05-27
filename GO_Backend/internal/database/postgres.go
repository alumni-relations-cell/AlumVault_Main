package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool wraps a pgxpool.Pool with convenience methods.
type Pool struct {
	*pgxpool.Pool
}

// NewPool creates a new PostgreSQL connection pool from the given URL.
// The pool is configured with a maximum of 20 connections.
func NewPool(url string) (*Pool, error) {
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("unable to parse database config: %v", err)
	}

	config.MaxConns = 20
	config.MinConns = 2

	dbpool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("unable to create connection pool: %v", err)
	}

	if err := dbpool.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("unable to ping database: %v", err)
	}

	return &Pool{Pool: dbpool}, nil
}
