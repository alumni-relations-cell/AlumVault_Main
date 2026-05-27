FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG SERVICE=matcher
RUN CGO_ENABLED=0 go build -o /out/worker ./cmd/${SERVICE}


FROM alpine:latest AS runner

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=builder /out/worker /app/worker

CMD ["/app/worker"]
