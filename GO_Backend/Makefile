# go-backend/Makefile

.PHONY: build-all run-matcher run-verifier run-importer run-dedup test

build-all:
	go build -o bin/matcher cmd/matcher/main.go
	go build -o bin/verifier cmd/verifier/main.go
	go build -o bin/importer cmd/importer/main.go
	go build -o bin/dedup cmd/dedup/main.go

run-matcher:
	go run cmd/matcher/main.go

run-verifier:
	go run cmd/verifier/main.go

run-importer:
	go run cmd/importer/main.go

run-dedup:
	go run cmd/dedup/main.go

test:
	go test ./internal/... -v

lint:
	golangci-lint run ./...
