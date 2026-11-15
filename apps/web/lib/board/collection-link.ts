/**
 * A pasted collection link is stored as an encrypted envelope in
 * WallpaperCollection.sourceSecret (VarChar(2048)). The envelope is base64url
 * of the ciphertext plus a wrapped key and IVs, so it is roughly 1.33x the
 * link plus a fixed overhead; a 2048-character link could not fit and the
 * save failed with a 500 after the row was already created. The input cap is
 * therefore well under the column width (see collection-link.test.ts).
 */
export const SOURCE_SECRET_COLUMN = 2048;
export const MAX_COLLECTION_LINK = 1400;
