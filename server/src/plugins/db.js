import fp from 'fastify-plugin';
import mongoose from 'mongoose';

async function dbPlugin(fastify, options) {
  const uri = options.uri || fastify.config.mongoUri;
  try {
    await mongoose.connect(uri);
    fastify.log.info('MongoDB connected');
  } catch (err) {
    fastify.log.error('MongoDB connection error:', err);
    throw err;
  }
  fastify.decorate('mongoose', mongoose);
  fastify.addHook('onClose', async () => {
    await mongoose.connection.close();
  });
}

export default fp(dbPlugin, { name: 'db' });
