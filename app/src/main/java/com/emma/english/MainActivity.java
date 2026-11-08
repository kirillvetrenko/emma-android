package com.emma.english;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.webkit.ValueCallback;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Locale;

public class MainActivity extends Activity {
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady;
    private SpeechRecognizer recognizer;
    private String recognitionId;
    private String permissionId;
    private boolean destroyed;
    private String pendingBackup;
    private ValueCallback<Uri[]> fileCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        web.requestApplyInsets();
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                String accepted=String.join(",",params.getAcceptTypes());
                intent.setType(accepted.contains("srt")||accepted.contains("vtt")||accepted.contains("text")?"*/*":"application/json");
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                try { startActivityForResult(intent, 44); }
                catch (Exception error) { fileCallback.onReceiveValue(null); fileCallback = null; }
                return true;
            }
        });
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())) return false;
                if ("https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                }
                return true;
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "EmmaNative", Collections.singleton("https://appassets.androidplatform.net"),
                (view, message, origin, mainFrame, reply) -> {
                    if (!mainFrame || destroyed) return;
                    try { handle(new JSONObject(message.getData())); } catch (Exception ignored) {}
                });
        }
        tts = new TextToSpeech(this, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) {
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) { emit(id,"speech-start", new JSONObject()); }
                    @Override public void onDone(String id) { emit(id,"speech-end", new JSONObject()); }
                    @Override public void onError(String id) { emit(id,"speech-error", json("error","synthesis-failed")); }
                });
            }
            emit("", "voices-changed", new JSONObject());
        });
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }
    private static JSONObject json(String key, Object value) {
        JSONObject data = new JSONObject(); try { data.put(key,value); } catch(Exception ignored) {} return data;
    }
    private void emit(String id, String type, JSONObject data) {
        try { data.put("id",id); data.put("type",type); } catch(Exception ignored) {}
        final String value = data.toString();
        runOnUiThread(() -> { if (!destroyed) web.evaluateJavascript("window.emmaNativeEvent("+value+")",null); });
    }
    private void handle(JSONObject data) {
        String id=data.optString("id"), command=data.optString("command");
        switch(command) {
            case "export-backup":
                if (pendingBackup != null) break;
                String backup = data.optString("text");
                if (backup.length() > 3000000) break;
                pendingBackup = backup;
                Intent saveIntent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                saveIntent.addCategory(Intent.CATEGORY_OPENABLE);
                String mime=data.optString("mime","application/json");
                saveIntent.setType("application/x-subrip".equals(mime)?mime:"application/json");
                saveIntent.putExtra(Intent.EXTRA_TITLE,"application/x-subrip".equals(mime)?"emma-subtitles.srt":"emma-progress.json");
                try { startActivityForResult(saveIntent,43); }
                catch (Exception error) { pendingBackup=null; emit("backup","backup-result",json("ok",false)); }
                break;
            case "permission":
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)
                    emit(id,"permission",json("granted",true));
                else if (permissionId != null) emit(id,"permission",json("granted",false));
                else { permissionId=id; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},42); }
                break;
            case "voices":
                JSONArray list=new JSONArray();
                if(ttsReady && tts.getVoices()!=null) for(Voice voice:tts.getVoices()) {
                    JSONObject item=json("voiceURI",voice.getName());
                    try { item.put("name",voice.getName()); item.put("lang",voice.getLocale().toLanguageTag());
                        item.put("localService",!voice.isNetworkConnectionRequired()); } catch(Exception ignored) {}
                    list.put(item);
                }
                emit(id,"voices",json("voices",list)); break;
            case "speak":
                if(!ttsReady) { emit(id,"speech-error",json("error","not-ready")); break; }
                Locale locale=Locale.forLanguageTag(data.optString("lang","en-US"));
                int languageStatus=tts.setLanguage(locale);
                if(languageStatus<0) { emit(id,"speech-error",json("error","language-unavailable")); break; }
                String chosen=data.optString("voiceURI");
                if(tts.getVoices()!=null) for(Voice voice:tts.getVoices()) if(voice.getName().equals(chosen)) { tts.setVoice(voice); break; }
                tts.setSpeechRate((float)Math.max(.5,Math.min(1.5,data.optDouble("rate",.85))));
                tts.setPitch((float)Math.max(.5,Math.min(1.5,data.optDouble("pitch",1))));
                Bundle options=new Bundle(); options.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME,(float)Math.max(0,Math.min(1,data.optDouble("volume",1))));
                if(tts.speak(data.optString("text"),TextToSpeech.QUEUE_FLUSH,options,id)==TextToSpeech.ERROR)
                    emit(id,"speech-error",json("error","synthesis-failed"));
                break;
            case "cancel-speech": if(tts!=null)tts.stop(); break;
            case "listen": startRecognition(id,data.optString("lang","en-US")); break;
            case "stop-listen": if(recognizer!=null && id.equals(recognitionId))recognizer.stopListening(); break;
            case "abort-listen": if(id.equals(recognitionId))stopRecognition(); break;
        }
    }
    private void stopRecognition() {
        SpeechRecognizer previous=recognizer;
        recognitionId=null; recognizer=null;
        if(previous!=null) { previous.cancel();previous.destroy(); }
    }
    private void startRecognition(String id,String language) {
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) {
            emit(id,"recognition-error",json("error","not-allowed"));emit(id,"recognition-end",new JSONObject());return;
        }
        if(!SpeechRecognizer.isRecognitionAvailable(this)) {
            emit(id,"recognition-error",json("error","service-not-allowed"));emit(id,"recognition-end",new JSONObject());return;
        }
        stopRecognition(); recognitionId=id;
        recognizer=SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            private boolean active(){return id.equals(recognitionId);}
            @Override public void onReadyForSpeech(Bundle params) { if(active())emit(id,"recognition-start",new JSONObject()); }
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rms) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}
            private void results(Bundle values,boolean finalResult){
                if(!active())return;
                ArrayList<String> items=values.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if(items!=null && !items.isEmpty()) {
                    JSONObject result=json("text",items.get(0));try{result.put("final",finalResult);}catch(Exception ignored){}
                    emit(id,"recognition-result",result);
                }
                if(finalResult){emit(id,"recognition-end",new JSONObject());stopRecognition();}
            }
            @Override public void onResults(Bundle values) { results(values,true); }
            @Override public void onPartialResults(Bundle values) { results(values,false); }
            @Override public void onEvent(int type,Bundle params) {}
            @Override public void onError(int code) {
                if(!active())return;
                String error=code==SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS?"not-allowed":
                    code==SpeechRecognizer.ERROR_NETWORK||code==SpeechRecognizer.ERROR_NETWORK_TIMEOUT?"network":
                    code==SpeechRecognizer.ERROR_AUDIO?"audio-capture":
                    code==SpeechRecognizer.ERROR_NO_MATCH||code==SpeechRecognizer.ERROR_SPEECH_TIMEOUT?"no-speech":"service-not-allowed";
                emit(id,"recognition-error",json("error",error));emit(id,"recognition-end",new JSONObject());stopRecognition();
            }
        });
        Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,language);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true);
        try { recognizer.startListening(intent); } catch(Exception error) {
            emit(id,"recognition-error",json("error","service-not-allowed"));emit(id,"recognition-end",new JSONObject());stopRecognition();
        }
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants) {
        super.onRequestPermissionsResult(code,permissions,grants);
        if(code==42 && permissionId!=null) {emit(permissionId,"permission",json("granted",grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED));permissionId=null;}
    }
    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code,result,data);
        if (code==44 && fileCallback!=null) {
            fileCallback.onReceiveValue(result==RESULT_OK && data!=null && data.getData()!=null ? new Uri[]{data.getData()} : null);
            fileCallback=null;
        }
        if (code==43 && pendingBackup!=null) {
            String backup=pendingBackup; pendingBackup=null; boolean ok=false;
            if (result==RESULT_OK && data!=null && data.getData()!=null) {
                try (OutputStream stream=getContentResolver().openOutputStream(data.getData())) {
                    if (stream!=null) { stream.write(backup.getBytes(StandardCharsets.UTF_8)); ok=true; }
                } catch(Exception ignored) {}
            }
            emit("backup","backup-result",json("ok",ok));
        }
    }
    @Override protected void onPause(){super.onPause();if(permissionId==null)web.evaluateJavascript("if(typeof stopVoice==='function')stopVoice()",null);stopRecognition();if(tts!=null)tts.stop();}
    @Override protected void onDestroy(){destroyed=true;if(fileCallback!=null){fileCallback.onReceiveValue(null);fileCallback=null;}stopRecognition();if(tts!=null)tts.shutdown();web.destroy();super.onDestroy();}
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}
