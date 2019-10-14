#!/usr/bin/env bash

set -o errexit
set -o nounset

yarn run knex migrate:latest

exec node "$@"