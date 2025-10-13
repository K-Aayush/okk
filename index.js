import express from 'express';
import expressGraphql from 'express-graphql';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import GraphQLDate from 'graphql-date';
import { makeExecutableSchema } from '@graphql-tools/schema';
import bodyParser from 'body-parser';

dotenv.config();

import RestApiResolver from './src/restApis/routes';
import testController from './src/test';
import { connect } from './src/db';
import models from './src/gqlModels';
import adminModels from './src/gqlModels/admin';
import { queries, mutations, root } from './src/queries';
import { adminQueries, adminMutations, adminRoot } from './src/queries/admin';
import { getUser, getAdminUser } from './src/utils';
import socketManager from './src/services/socket-manager';
import GraphQLJSON, { GraphQLJSONObject } from 'graphql-type-json';

import BackgroundJobService from './src/backgroundJobs/processor';

const { graphqlHTTP } = expressGraphql;
const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(bodyParser.json({ limit: '10mb' }));

const typeDefs = `
  ${models}
  type Query {
    ${queries}
  }
  type Mutation {
    ${mutations}
  }
`;

const resolvers = {
  Contact: {
    __resolveType(obj, context, info) {
      if (obj.role) {
        return 'User';
      }
      if (obj.npi) {
        return 'Practice';
      }
      return 'Group';
    },
  },
};

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

Object.assign(schema._typeMap.Date, GraphQLDate);
Object.assign(schema._typeMap.JSON, GraphQLJSON);
Object.assign(schema._typeMap.JSONObject, GraphQLJSONObject);

app.use(
  '/graphql',
  graphqlHTTP(async (req) => {
    const token = req.headers.authorization || '';
    // try to retrieve a user with the token

    let user = null;
    try {
      user = await getUser(token);
    } catch (error) {}

    // add the user to the context
    return {
      schema: schema,
      rootValue: root,
      graphiql: {
        headerEditorEnabled: true,
      },
      context: { user },
    };
  })
);

const adminTypeDefs = `
  ${adminModels}
  type Query {
    ${adminQueries}
  }
  type Mutation {
    ${adminMutations}
  }
`;

const adminSchema = makeExecutableSchema({
  typeDefs: adminTypeDefs,
});

Object.assign(adminSchema._typeMap.Date, GraphQLDate);
Object.assign(adminSchema._typeMap.JSON, GraphQLJSON);
Object.assign(adminSchema._typeMap.JSONObject, GraphQLJSONObject);

app.use(
  '/admin/graphql',
  graphqlHTTP(async (req) => {
    const token = req.headers.authorization || '';
    // try to retrieve a user with the token

    let user = null;
    try {
      user = await getAdminUser(token);
    } catch (error) {}

    // add the user to the context
    return {
      schema: adminSchema,
      rootValue: adminRoot,
      graphiql: {
        headerEditorEnabled: true,
      },
      context: { user },
    };
  })
);

app.use(express.json());
RestApiResolver(app);

app.use('/static', express.static('public'));

app.use('/test', testController.test);

const server = http.createServer();

server.on('request', app);

server.on('upgrade', async (request, socket, head) => {
  try {
    socketManager.serverInstance.handleUpgrade(request, socket, head, (ws) => {
      if (!request.user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      } else {
        socketManager.serverInstance.emit('connection', ws, request.user);
      }
    });
  } catch (error) {
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

const PORT = process.env.PORT || 4000;

connect(process.env.DB_URI)
  .then(() => {
    server.listen(PORT, () => {
      console.log(
        '==> Listening on port %s. Visit http://localhost:%s/graphql in your browser.',
        PORT,
        PORT
      );
    });
    new BackgroundJobService().run(app);
  })
  .catch((error) => {
    console.error(error);
  });
