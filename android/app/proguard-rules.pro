# Flutter's own engine/embedding classes must survive shrinking.
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.**  { *; }
-keep class io.flutter.plugins.**  { *; }

# sqflite runs raw SQL through reflection-free bindings, but keep its models safe.
-keep class com.tekartik.sqflite.** { *; }
