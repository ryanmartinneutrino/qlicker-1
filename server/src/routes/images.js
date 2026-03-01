import Image from '../models/Image.js';
import { generateMeteorId } from '../utils/meteorId.js';

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default async function imageRoutes(app) {
  const { authenticate } = app;

  // POST / — Upload an image
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'Bad Request', message: 'No file uploaded' });
    }

    if (!ALLOWED_MIMETYPES.includes(data.mimetype)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: `Invalid file type. Allowed: ${ALLOWED_MIMETYPES.join(', ')}`,
      });
    }

    const buffer = await data.toBuffer();

    if (buffer.length > 5 * 1024 * 1024) {
      return reply.code(400).send({ error: 'Bad Request', message: 'File size exceeds 5MB limit' });
    }

    const { url, key } = await app.uploadFile(buffer, data.filename, data.mimetype);

    const image = await Image.create({
      _id: generateMeteorId(),
      url,
      key,
      UID: request.user.userId,
      type: data.mimetype,
      size: buffer.length,
      createdAt: new Date(),
    });

    return reply.code(201).send({
      image: {
        _id: image._id,
        url: image.url,
        type: image.type,
        size: image.size,
        createdAt: image.createdAt,
      },
    });
  });

  // DELETE /:id — Delete an image (admin or uploader only)
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const image = await Image.findById(request.params.id);
    if (!image) {
      return reply.code(404).send({ error: 'Not Found', message: 'Image not found' });
    }

    const isAdmin = (request.user.roles || []).includes('admin');
    const isOwner = image.UID === request.user.userId;
    if (!isAdmin && !isOwner) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
    }

    await app.deleteFile(image.key);
    await image.deleteOne();

    return { success: true };
  });
}
