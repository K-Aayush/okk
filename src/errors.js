import { GraphQLError } from 'graphql';

export class GraphQLUserError extends GraphQLError {
  constructor(...args) {
    super(...args);
    this.extensions = this.extensions || {};
    this.extensions.code = 'USER_DEFINED';
  }
}
