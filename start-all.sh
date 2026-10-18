#!/usr/bin/env bash
# Relance tout le nécessaire en local (idempotent) : Postgres privé, backend, PWA client/restaurant/livreur + admin.
# Redis (6379) doit déjà tourner. Les PWA doivent avoir été construites (`npx next build` dans chaque dossier).
cd "$(dirname "$0")"
PG=/usr/lib/postgresql/16/bin/pg_ctl
ss -ltn | grep -q ':5544 ' || $PG -D .pgdata -o "-p 5544 -c listen_addresses=localhost -c unix_socket_directories=/tmp" -l .pgdata/server.log start
start() { # nom port commande...
  local name=$1 port=$2; shift 2
  if ss -ltn | grep -q ":$port "; then echo "$name : déjà lancé ($port)"; else (cd "$name" && setsid nohup "$@" < /dev/null > "/tmp/$name.log" 2>&1 &) ; echo "$name : lancé ($port)"; fi
}
start backend 4000 node dist/src/main.js
start client 3000 npx next start -p 3000
start restaurant 3001 npx next start -p 3001
start livreur 3002 npx next start -p 3002
start admin 3003 npx next start -p 3003
sleep 4
for p in 4000 3000 3001 3002 3003; do printf "%s -> " $p; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:$p/$([ $p = 4000 ] && echo api/v1/restaurant-categories); done
