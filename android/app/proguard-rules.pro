# ---------------------------------------------------------------------------
# R8 / ProGuard rules for a Capacitor app.
#
# Capacitor resolves plugins and their @PluginMethod entry points by NAME at
# runtime, via reflection from JavaScript. R8 cannot see those call sites, so
# every bridge surface has to be kept explicitly or the app compiles fine and
# then fails the moment JS calls into a plugin.
# ---------------------------------------------------------------------------

# Reflection metadata Capacitor and Gson-style parsing rely on.
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses,EnclosingMethod
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations

# --- Capacitor core bridge -------------------------------------------------
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep enum com.getcapacitor.** { *; }

# Every plugin class and the annotated members the bridge invokes.
-keep class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
}

# Anything exposed to the WebView through addJavascriptInterface.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# --- Capacitor plugins used by this app ------------------------------------
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.getcapacitor.community.database.sqlite.** { *; }

# --- SQLite / SQLCipher (JNI: native code looks these up by name) ---------
-keep class net.zetetic.** { *; }
-keep class net.sqlcipher.** { *; }
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}
-keep class androidx.sqlite.** { *; }
-keep interface androidx.sqlite.** { *; }

# Our own native bridge additions (see MainActivity).
-keep class com.trinity.hotelmanager.** { *; }

# --- Cordova compatibility layer (Capacitor loads it reflectively) --------
-keep class org.apache.cordova.** { *; }
-dontwarn org.apache.cordova.**

# --- Kotlin / AndroidX noise ----------------------------------------------
-dontwarn kotlin.**
-dontwarn kotlinx.**
-dontwarn javax.annotation.**
-dontwarn org.slf4j.**

# Keep enum machinery (values()/valueOf() are used reflectively).
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep Parcelable CREATOR fields.
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Readable crash reports: this app has no crash-reporting service, so line
# numbers are the only diagnostic available from a user's device.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
