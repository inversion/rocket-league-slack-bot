FROM node:12.14.0

ENV NODE_ENV production

WORKDIR /app
RUN chown node /app

USER node

COPY --chown=node context/package.json context/yarn.lock ./
RUN yarn --frozen-lockfile --non-interactive --production=false --no-cache && yarn cache clean

COPY --chown=node context/tsconfig.json context/run.sh context/knexfile.js ./
COPY --chown=node context/migrations ./migrations
COPY --chown=node context/src ./src

RUN yarn run build

VOLUME /data

EXPOSE 8888
EXPOSE 9229

ENTRYPOINT ["./run.sh"]
CMD [ "src/main" ]
