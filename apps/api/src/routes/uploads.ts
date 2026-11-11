import { Router } from 'express';
import { authRequired } from '../lib/auth.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { storeUpload } from '../lib/storage.js';
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
    // A misconfigured bucket falls back to the local path instead of losing
    // the upload; the warning in the logs explains what to fix.
    const url = await storeUpload(file);

    res.status(201).json({
      url,
      kind,
      mimeType: file.mimetype,
      size: file.size,
      name: displayFileName(file.originalname, file.mimetype),
    });
  }),
);
