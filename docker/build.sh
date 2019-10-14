#!/usr/bin/env bash

set -o errexit
set -o nounset

rm -rf context
mkdir -p context
cp -R ../{src,package.json,tsconfig.json,yarn.lock,run.sh,knexfile.js,migrations} context/

docker build --network=host -t rocket-league-slack-bot .

rm -rf context