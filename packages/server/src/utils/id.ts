import crypto from 'crypto'

/**
 * Generate Meteor-compatible string _id values.
 * The legacy app stores _id fields as strings (not ObjectId).
 */
export function generateStringId(prefix = 'id'): string {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`
}
