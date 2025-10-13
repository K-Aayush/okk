import mongoose from 'mongoose';

/**
 * The default options fix all deprecation warnings in MongoDB Node.js driver.
 * For more details, visit https://mongoosejs.com/docs/deprecations.html
 */
const defaultOptions = {
  useFindAndModify: false,
  useNewUrlParser: true,
  useCreateIndex: true,
  useUnifiedTopology: true,
};

/**
 * Opens the default mongoose connection.
 * @param {string} uri
 * @returns {Promise}
 */
export const connect = (uri) => {
  return mongoose.connect(uri, { ...defaultOptions });
};

// mongoose.set('debug', true);

export * from './models';
