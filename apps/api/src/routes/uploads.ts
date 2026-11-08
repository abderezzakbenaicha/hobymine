import { Router } from 'express';
import { authRequired } from '../lib/auth.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { publishUpload, storageEnabled } from '../lib/storage.js';
import { displayFileName, mimeKind, upload } from '../lib/uploads.js';

export const uploadsRouter = Router();

uploadsRouter.use(authRequired);

uploadsRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new ApiError(400, 'Choose a file to upload', 'no_file');
    const kind = mimeKind(file.mimetype);
    if (!kind) {
      throw new ApiError(415, 'Unsupported file type', 'unsupported_file_type');
    }

    // Cloud hosts wipe their disk on every deploy, so prefer Supabase Storage.
    // If the bucket is misconfigured we keep the local path rather than losing
    // the upload entirely; the warning in the logs explains what to fix.
    let url = `/uploads/${file.filename}`;
    if (storageEnabled() && file.path) {
      try {
        url = await publishUpload(file.path, file.mimetype);
      } catch (error) {
        console.warn(
          `[hobymine] Upload stored locally because Supabase Storage failed: ${(error as Error).message}`,
        );
      }
    }

    res.status(201).json({
      url,
      kind,
      mimeType: file.mimetype,
      size: file.size,
      name: displayFileName(file.originalname, file.mimetype),
    });
  }),
);
