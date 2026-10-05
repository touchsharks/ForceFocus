package com.forcefocus.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;

final class SidebarSplitDrawable extends Drawable {
    private static final float SIDEBAR_RATIO = 55.2f / 69.0f;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Bitmap sidebarBackground;

    SidebarSplitDrawable(Bitmap sidebarBackground) {
        this.sidebarBackground = sidebarBackground;
    }

    @Override
    public void draw(Canvas canvas) {
        Rect bounds = getBounds();
        int split = bounds.left + Math.round(bounds.width() * SIDEBAR_RATIO);
        paint.setColor(Color.rgb(255, 253, 228));
        canvas.drawRect(bounds.left, bounds.top, split, bounds.bottom, paint);
        if (sidebarBackground != null && !sidebarBackground.isRecycled()) {
            float scale = Math.max((float) (split - bounds.left) / sidebarBackground.getWidth(),
                    (float) bounds.height() / sidebarBackground.getHeight());
            int sourceWidth = Math.min(sidebarBackground.getWidth(), Math.round((split - bounds.left) / scale));
            int sourceHeight = Math.min(sidebarBackground.getHeight(), Math.round(bounds.height() / scale));
            Rect source = new Rect(0, 0, sourceWidth, sourceHeight);
            Rect destination = new Rect(bounds.left, bounds.top, split, bounds.bottom);
            canvas.drawBitmap(sidebarBackground, source, destination, paint);
        }
        paint.setColor(Color.argb(31, 44, 52, 38));
        canvas.drawRect(split, bounds.top, bounds.right, bounds.bottom, paint);
    }

    @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); }
    @Override public void setColorFilter(android.graphics.ColorFilter filter) { paint.setColorFilter(filter); }
    @Override public int getOpacity() { return android.graphics.PixelFormat.TRANSLUCENT; }
}
