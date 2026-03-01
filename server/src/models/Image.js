import mongoose from 'mongoose';
import { generateMeteorId } from '../utils/meteorId.js';

const ImageSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => generateMeteorId() },
    url: { type: String, required: true },
    key: { type: String, required: true },
    UID: { type: String, required: true },
    type: { type: String, required: true },
    size: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'images',
    timestamps: false,
  }
);

const Image = mongoose.model('Image', ImageSchema);

export default Image;
