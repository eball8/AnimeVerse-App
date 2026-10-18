package com.animeverse.app;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Size;
import android.webkit.MimeTypeMap;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "Gallery",
    permissions = {
        @Permission(alias = "images", strings = { "android.permission.READ_MEDIA_IMAGES" }),
        @Permission(alias = "videos", strings = { "android.permission.READ_MEDIA_VIDEO" }),
        @Permission(alias = "partial", strings = { "android.permission.READ_MEDIA_VISUAL_USER_SELECTED" }),
        @Permission(alias = "storage", strings = { "android.permission.READ_EXTERNAL_STORAGE" }),
        @Permission(alias = "camera", strings = { "android.permission.CAMERA" })
    }
)
public class GalleryPlugin extends Plugin {

    private static final String PERM_IMAGES = "android.permission.READ_MEDIA_IMAGES";
    private static final String PERM_VIDEO = "android.permission.READ_MEDIA_VIDEO";
    private static final String PERM_PARTIAL = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED";
    private static final String PERM_STORAGE = "android.permission.READ_EXTERNAL_STORAGE";
    private static final String PERM_CAMERA = "android.permission.CAMERA";

    private static final int MEDIA_TYPE_IMAGE = 1;
    private static final int MEDIA_TYPE_VIDEO = 3;

    private boolean has(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasMediaAccess() {
        if (Build.VERSION.SDK_INT >= 34) {
            return has(PERM_IMAGES) || has(PERM_VIDEO) || has(PERM_PARTIAL);
        }
        if (Build.VERSION.SDK_INT >= 33) {
            return has(PERM_IMAGES) || has(PERM_VIDEO);
        }
        return has(PERM_STORAGE);
    }

    private JSObject statusObject() {
        JSObject ret = new JSObject();
        ret.put("media", hasMediaAccess());
        ret.put("camera", has(PERM_CAMERA));
        return ret;
    }

    @PluginMethod
    public void checkAccess(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        List<String> aliases = new ArrayList<>();
        if (!hasMediaAccess()) {
            if (Build.VERSION.SDK_INT >= 33) {
                aliases.add("images");
                aliases.add("videos");
                if (Build.VERSION.SDK_INT >= 34) {
                    aliases.add("partial");
                }
            } else {
                aliases.add("storage");
            }
        }
        if (!has(PERM_CAMERA)) {
            aliases.add("camera");
        }
        if (aliases.isEmpty()) {
            call.resolve(statusObject());
            return;
        }
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "accessCallback");
    }

    @PermissionCallback
    private void accessCallback(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("تعذّر فتح الإعدادات");
        }
    }

    @PluginMethod
    public void getMedias(PluginCall call) {
        if (!hasMediaAccess()) {
            call.reject("NO_PERMISSION");
            return;
        }

        int offset = call.getInt("offset", 0);
        int limit = call.getInt("limit", 48);
        int thumbSize = call.getInt("thumbSize", 256);
        String type = call.getString("type", "all");

        try {
            ContentResolver resolver = getContext().getContentResolver();
            Uri collection = MediaStore.Files.getContentUri("external");

            List<String> projection = new ArrayList<>();
            projection.add(MediaStore.Files.FileColumns._ID);
            projection.add(MediaStore.Files.FileColumns.MEDIA_TYPE);
            projection.add(MediaStore.Files.FileColumns.MIME_TYPE);
            projection.add(MediaStore.Files.FileColumns.DATE_ADDED);
            if (Build.VERSION.SDK_INT >= 29) {
                projection.add(MediaStore.MediaColumns.DURATION);
            }
            String[] projectionArray = projection.toArray(new String[0]);

            String selection;
            if ("images".equals(type)) {
                selection = MediaStore.Files.FileColumns.MEDIA_TYPE + "=" + MEDIA_TYPE_IMAGE;
            } else if ("videos".equals(type)) {
                selection = MediaStore.Files.FileColumns.MEDIA_TYPE + "=" + MEDIA_TYPE_VIDEO;
            } else {
                selection = MediaStore.Files.FileColumns.MEDIA_TYPE + " IN (" + MEDIA_TYPE_IMAGE + "," + MEDIA_TYPE_VIDEO + ")";
            }

            Cursor cursor;
            if (Build.VERSION.SDK_INT >= 26) {
                Bundle args = new Bundle();
                args.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection);
                args.putStringArray(
                    ContentResolver.QUERY_ARG_SORT_COLUMNS,
                    new String[] { MediaStore.Files.FileColumns.DATE_ADDED }
                );
                args.putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION, ContentResolver.QUERY_SORT_DIRECTION_DESCENDING);
                args.putInt(ContentResolver.QUERY_ARG_LIMIT, limit + 1);
                args.putInt(ContentResolver.QUERY_ARG_OFFSET, offset);
                cursor = resolver.query(collection, projectionArray, args, null);
            } else {
                String sort = MediaStore.Files.FileColumns.DATE_ADDED + " DESC LIMIT " + (limit + 1) + " OFFSET " + offset;
                cursor = resolver.query(collection, projectionArray, selection, null, sort);
            }

            JSArray items = new JSArray();
            boolean hasMore = false;

            if (cursor != null) {
                try {
                    int idCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID);
                    int typeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE);
                    int mimeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE);
                    int dateCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_ADDED);
                    int durCol = -1;
                    if (Build.VERSION.SDK_INT >= 29) {
                        durCol = cursor.getColumnIndex(MediaStore.MediaColumns.DURATION);
                    }

                    int count = 0;
                    while (cursor.moveToNext()) {
                        if (count >= limit) {
                            hasMore = true;
                            break;
                        }
                        count++;

                        long id = cursor.getLong(idCol);
                        int mediaType = cursor.getInt(typeCol);
                        boolean isVideo = mediaType == MEDIA_TYPE_VIDEO;
                        String mime = cursor.getString(mimeCol);
                        long date = cursor.getLong(dateCol);
                        long duration = 0;
                        if (durCol >= 0 && isVideo) {
                            duration = cursor.getLong(durCol);
                        }

                        Uri uri = ContentUris.withAppendedId(
                            isVideo ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                            id
                        );

                        JSObject item = new JSObject();
                        item.put("id", String.valueOf(id));
                        item.put("uri", uri.toString());
                        item.put("type", isVideo ? "video" : "image");
                        item.put("mime", mime == null ? "" : mime);
                        item.put("duration", duration);
                        item.put("date", date);
                        item.put("thumb", buildThumbnail(uri, isVideo, thumbSize));
                        items.put(item);
                    }
                } finally {
                    cursor.close();
                }
            }

            JSObject ret = new JSObject();
            ret.put("medias", items);
            ret.put("hasMore", hasMore);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("تعذّر قراءة المعرض: " + e.getMessage());
        }
    }

    private String buildThumbnail(Uri uri, boolean isVideo, int size) {
        Bitmap bitmap = null;
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                bitmap = getContext().getContentResolver().loadThumbnail(uri, new Size(size, size), null);
            }
        } catch (Exception ignored) {
            bitmap = null;
        }

        if (bitmap == null) {
            try {
                if (isVideo) {
                    MediaMetadataRetriever retriever = new MediaMetadataRetriever();
                    try {
                        retriever.setDataSource(getContext(), uri);
                        bitmap = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                    } finally {
                        retriever.release();
                    }
                } else {
                    bitmap = decodeSampled(uri, size);
                }
            } catch (Exception ignored) {
                bitmap = null;
            }
        }

        if (bitmap == null) {
            return "";
        }

        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 72, out);
            String base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            return "data:image/jpeg;base64," + base64;
        } catch (Exception e) {
            return "";
        }
    }

    private Bitmap decodeSampled(Uri uri, int target) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        InputStream first = resolver.openInputStream(uri);
        if (first == null) return null;
        try {
            BitmapFactory.decodeStream(first, null, bounds);
        } finally {
            first.close();
        }

        int sample = 1;
        int longest = Math.max(bounds.outWidth, bounds.outHeight);
        while (longest / (sample * 2) >= target) {
            sample *= 2;
        }

        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        InputStream second = resolver.openInputStream(uri);
        if (second == null) return null;
        try {
            return BitmapFactory.decodeStream(second, null, opts);
        } finally {
            second.close();
        }
    }

    @PluginMethod
    public void copyToCache(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null || uriString.isEmpty()) {
            call.reject("المسار مفقود");
            return;
        }

        Uri uri = Uri.parse(uriString);
        if (!"content".equals(uri.getScheme()) || !"media".equals(uri.getAuthority())) {
            call.reject("مسار غير مسموح");
            return;
        }

        try {
            ContentResolver resolver = getContext().getContentResolver();
            String mime = resolver.getType(uri);
            String ext = null;
            if (mime != null) {
                ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            }
            if (ext == null || ext.isEmpty()) {
                ext = (mime != null && mime.startsWith("video/")) ? "mp4" : "jpg";
            }

            File dir = getContext().getCacheDir();
            cleanOldPicks(dir);

            File out = new File(dir, "av_pick_" + System.currentTimeMillis() + "." + ext);
            InputStream in = resolver.openInputStream(uri);
            if (in == null) {
                call.reject("تعذّر فتح الملف");
                return;
            }
            long total = 0;
            try {
                OutputStream os = new FileOutputStream(out);
                try {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        os.write(buffer, 0, read);
                        total += read;
                    }
                } finally {
                    os.close();
                }
            } finally {
                in.close();
            }

            JSObject ret = new JSObject();
            ret.put("path", out.getAbsolutePath());
            ret.put("mime", mime == null ? "" : mime);
            ret.put("size", total);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("تعذّر نسخ الملف: " + e.getMessage());
        }
    }

    private void cleanOldPicks(File dir) {
        try {
            File[] files = dir.listFiles();
            if (files == null) return;
            long cutoff = System.currentTimeMillis() - 60L * 60L * 1000L;
            for (File f : files) {
                if (f.getName().startsWith("av_pick_") && f.lastModified() < cutoff) {
                    f.delete();
                }
            }
        } catch (Exception ignored) {
        }
    }
}
