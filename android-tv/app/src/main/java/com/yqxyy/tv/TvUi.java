package com.yqxyy.tv;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

final class TvUi {
  static final int BG=Color.rgb(9,15,28),CARD=Color.rgb(24,38,60);
  static final int WHITE=Color.rgb(240,246,255),DIM=Color.rgb(154,170,194),ACCENT=Color.rgb(116,220,255);
  static int dp(Context ctx,float val){return (int)(val*ctx.getResources().getDisplayMetrics().density+0.5f);}
  static GradientDrawable bg(int color,int radius,Context ctx) {
    GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(ctx,radius));return d;
  }
  static GradientDrawable focused(Context ctx,boolean selected){
    GradientDrawable d=bg(selected?Color.rgb(36,77,107):CARD,12,ctx);
    if(selected)d.setStroke(dp(ctx,2),ACCENT);
    return d;
  }
  static TextView text(Context ctx,String value,int sp,int color,boolean bold){
    TextView t=new TextView(ctx);t.setText(value);t.setTextSize(sp);t.setTextColor(color);
    if(bold)t.setTypeface(android.graphics.Typeface.DEFAULT,android.graphics.Typeface.BOLD);
    t.setGravity(Gravity.CENTER_VERTICAL);return t;
  }
  static TextView button(Context ctx,String value,Runnable click){
    TextView b=text(ctx,value,16,WHITE,true);
    b.setGravity(Gravity.CENTER);b.setPadding(dp(ctx,22),dp(ctx,12),dp(ctx,22),dp(ctx,12));
    b.setBackground(focused(ctx,false));b.setFocusable(true);b.setClickable(true);
    b.setOnClickListener(v->click.run());
    b.setOnFocusChangeListener((v,focus)->{
      v.setBackground(focused(ctx,focus));v.setScaleX(focus?1.05f:1f);v.setScaleY(focus?1.05f:1f);
      ((TextView)v).setTextColor(focus?Color.WHITE:WHITE);
    });
    return b;
  }
  static LinearLayout column(Context ctx){LinearLayout l=new LinearLayout(ctx);l.setOrientation(LinearLayout.VERTICAL);return l;}
  static LinearLayout row(Context ctx){LinearLayout l=new LinearLayout(ctx);l.setOrientation(LinearLayout.HORIZONTAL);l.setGravity(Gravity.CENTER_VERTICAL);return l;}
  static void gap(LinearLayout parent,Context ctx,int height){
    View spacer=new View(ctx);parent.addView(spacer,new LinearLayout.LayoutParams(1,dp(ctx,height)));
  }
}
