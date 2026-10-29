import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val localSigningPropertiesFile =
    File(System.getProperty("user.home"), ".android/anyostore-release.properties")
val localSigningProperties = Properties().apply {
    if (localSigningPropertiesFile.isFile) {
        localSigningPropertiesFile.inputStream().use { load(it) }
    }
}

fun signingValue(environmentVariable: String, property: String): String? =
    System.getenv(environmentVariable)?.takeIf { it.isNotBlank() }
        ?: localSigningProperties.getProperty(property)?.takeIf { it.isNotBlank() }

val releaseStoreFile = signingValue("ANDROID_KEYSTORE_FILE", "storeFile")
val releaseStorePassword = signingValue("ANDROID_KEYSTORE_PASSWORD", "storePassword")
val releaseKeyAlias = signingValue("ANDROID_KEY_ALIAS", "keyAlias") ?: "anyostore-pos"
val releaseKeyPassword = signingValue("ANDROID_KEY_PASSWORD", "keyPassword") ?: releaseStorePassword

android {
    namespace = "com.anyostore.pos_pakaian_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.anyostore.pos_pakaian_mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            releaseStoreFile?.let { storeFile = file(it) }
            releaseStorePassword?.let { storePassword = it }
            keyAlias = releaseKeyAlias
            releaseKeyPassword?.let { keyPassword = it }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

tasks.configureEach {
    if (name == "validateSigningRelease") {
        doFirst {
            check(!releaseStoreFile.isNullOrBlank() && !releaseStorePassword.isNullOrBlank()) {
                "Release signing is not configured. Set up the Anyostore release keystore or GitHub Actions secrets."
            }
            check(file(releaseStoreFile!!).isFile) {
                "Android release keystore not found: $releaseStoreFile"
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
