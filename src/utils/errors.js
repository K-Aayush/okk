export const createAuthError = (error) => {
  if (error.errors) {
    throw Error(
      Object.values(error.errors)
        .map((e) => e.message)
        .join(', ')
    );
  } else if (
    error.name === 'MongoError' &&
    error.code === 11000 &&
    error.keyPattern.email
  ) {
    throw Error('Email must be unique');
  } else {
    throw Error(error);
  }
};
