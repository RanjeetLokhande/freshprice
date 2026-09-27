import { ApiError } from '@/server/api/errors';
import { withApi } from '@/server/api/with-api';

// Unknown API paths still answer with the standard envelope.
const notFound = withApi({ auth: false }, async () => {
  throw new ApiError('NOT_FOUND', 'Endpoint not found.');
});

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
