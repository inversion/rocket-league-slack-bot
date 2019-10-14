FROM node:12.11.1

ENV NODE_ENV production

WORKDIR /app
RUN chown node /app

USER node

COPY --chown=node context/package.json context/yarn.lock ./
RUN yarn --frozen-lockfile --non-interactive --production=false --no-cache

COPY --chown=node context/tsconfig.json context/run.sh context/knexfile.js ./
COPY --chown=node context/migrations ./migrations
COPY --chown=node context/src ./src

RUN yarn run build

VOLUME /data

EXPOSE 8888

ENTRYPOINT ["./run.sh"]
CMD [ "src/main" ]
