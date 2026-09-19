# Flutter's own engine/embedding classes must survive shrinking.
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.**  { *; }
-keep class io.flutter.plugins.**  { *; }

# sqflite runs raw SQL through reflection-free bindings, but keep its models safe.
-keep class com.tekartik.sqflite.** { *; }

# This app is sideloaded, never distributed through Play, so Flutter's optional
# Play Store split-install / deferred-component integration is dead code here.
# R8 still sees the references and fails the build, so silence them rather than
# adding the play-core dependency for something that can never run.
-dontwarn com.google.android.play.core.**
