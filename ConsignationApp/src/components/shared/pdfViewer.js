// src/components/shared/pdfViewer.js
// ✅ iOS   → <embed> base64 natif Safari
// ✅ Android → PDF.js haute résolution (scale 2.5 + devicePixelRatio)
// ✅ Couleurs dynamiques selon le rôle
// ✅ Gestion erreur 403 (validation_charge / validation_process)
// ✅ Téléchargement PDF via Sharing (sans MediaLibrary, sans permission)
// ✅ QR code contenant une URL publique — scan → téléchargement direct navigateur

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StatusBar, StyleSheet, Share, Alert, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import QrModal from './QrModal';

// ── Thèmes par rôle ──────────────────────────────────────────────────
const THEMES = {
  charge: {
    couleur:     '#2d6a4f',
    couleurDark: '#1b4332',
    bgPale:      '#d8f3dc',
    label:       'F-HSE-SEC-22-01',
    subLabel:    'Plan de consignation électrique',
  },
  process: {
    couleur:     '#b45309',
    couleurDark: '#92400e',
    bgPale:      '#fde68a',
    label:       'Plan de consignation',
    subLabel:    'Points process consignés',
  },
  default: {
    couleur:     '#2E7D32',
    couleurDark: '#1B5E20',
    bgPale:      '#d8f3dc',
    label:       'Document PDF',
    subLabel:    'PDF de consignation',
  },
};

export default function PdfViewer({ navigation, route }) {
  const {
    url,
    urlPublique, // ✅ URL publique encodée dans le QR (sans auth)
    titre = 'Document PDF',
    role  = 'default',
  } = route.params;

  const theme = THEMES[role] || THEMES.default;

  const webViewRef = useRef(null);

  const [etat,      setEtat]      = useState('chargement');
  const [pdfBase64, setPdfBase64] = useState(null);
  const [erreurMsg, setErreurMsg] = useState('');
  const [qrVisible, setQrVisible] = useState(false);

  // ✅ La valeur du QR = urlPublique si fournie, sinon url (fallback)
  const qrValue = urlPublique || url;

  useEffect(() => { chargerPDF(); }, []);

  const chargerPDF = async () => {
    setEtat('chargement');
    setErreurMsg('');
    setPdfBase64(null);

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        setErreurMsg('Session expirée. Veuillez vous reconnecter.');
        setEtat('erreur');
        return;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/pdf',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setErreurMsg('Session expirée. Veuillez vous reconnecter.');
        } else if (response.status === 404) {
          setErreurMsg('PDF non disponible pour cette demande.');
        } else if (response.status === 403) {
          try {
            const data = await response.json();
            if (data.besoin === 'validation_charge') {
              setErreurMsg('Accès refusé.\nValidez la consignation électrique pour accéder au PDF.');
            } else if (data.besoin === 'validation_process') {
              setErreurMsg('Accès refusé.\nValidez la consignation process pour accéder au PDF.');
            } else {
              setErreurMsg('Accès refusé.\nVous devez valider la consignation avant d\'accéder au PDF.');
            }
          } catch {
            setErreurMsg('Accès refusé.\nVous devez valider la consignation avant d\'accéder au PDF.');
          }
        } else {
          setErreurMsg(`Erreur serveur (${response.status}).`);
        }
        setEtat('erreur');
        return;
      }

      const blob   = await response.blob();
      const base64 = await blobToBase64(blob);
      setPdfBase64(base64);
      setEtat('affichage');

    } catch (e) {
      console.error('PdfViewer error:', e);
      setErreurMsg('Impossible de joindre le serveur.\nVérifiez votre connexion réseau.');
      setEtat('erreur');
    }
  };

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader   = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const partager = async () => {
    try { await Share.share({ message: `PDF consignation : ${url}` }); }
    catch (e) { Alert.alert('Erreur', 'Impossible de partager le PDF'); }
  };

  const telecharger = async () => {
    if (!pdfBase64) return;
    try {
      const nomFichier  = titre.replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf';
      const cheminLocal = FileSystem.cacheDirectory + nomFichier;

      await FileSystem.writeAsStringAsync(cheminLocal, pdfBase64, {
        encoding: 'base64',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Non disponible', "Le partage n'est pas disponible sur cet appareil.");
        return;
      }

      await Sharing.shareAsync(cheminLocal, {
        mimeType:    'application/pdf',
        dialogTitle: `Enregistrer ${nomFichier}`,
        UTI:         'com.adobe.pdf',
      });

    } catch (e) {
      console.error('Téléchargement erreur:', e);
      Alert.alert('Erreur', 'Impossible de télécharger le PDF.');
    }
  };

  // ─── iOS : <embed> natif Safari ──────────────────────────
  const htmlIOS = pdfBase64 ? `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
        <style>
          * { margin:0; padding:0; }
          html, body { width:100%; height:100%; background:#f0f0f0; }
          embed { width:100%; height:100%; display:block; }
        </style>
      </head>
      <body>
        <embed
          src="data:application/pdf;base64,${pdfBase64}#toolbar=0"
          type="application/pdf"
          width="100%" height="100%"
        />
      </body>
    </html>
  ` : '';

  // ─── Android : PDF.js haute résolution ───────────────────
  const htmlAndroid = pdfBase64 ? `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          html, body {
            width:100%; height:100%;
            background:#525659;
            overflow-x:hidden; overflow-y:auto;
          }
          #pages {
            display:flex; flex-direction:column;
            align-items:center; padding:12px 0; gap:10px;
          }
          canvas {
            display:block; width:100% !important;
            box-shadow:0 2px 12px rgba(0,0,0,0.6); background:white;
          }
          #msg {
            color:#fff; font-family:sans-serif; font-size:14px;
            text-align:center; padding:60px 20px;
          }
          #progress-wrap {
            position:fixed; bottom:0; left:0; right:0;
            background:rgba(0,0,0,0.5); padding:8px 16px;
            display:flex; align-items:center; gap:10px;
          }
          #progress-bar-bg {
            flex:1; height:6px; background:rgba(255,255,255,0.2);
            border-radius:3px; overflow:hidden;
          }
          #progress-bar {
            height:100%; background:${theme.couleur};
            border-radius:3px; transition:width 0.2s; width:0%;
          }
          #progress-txt {
            color:#fff; font-family:sans-serif; font-size:11px;
            min-width:60px; text-align:right;
          }
        </style>
      </head>
      <body>
        <div id="pages"><div id="msg">Chargement du PDF...</div></div>
        <div id="progress-wrap" style="display:none">
          <div id="progress-bar-bg"><div id="progress-bar"></div></div>
          <div id="progress-txt">0 / 0</div>
        </div>

        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

          const BASE64 = '${pdfBase64}';
          const DPR    = window.devicePixelRatio || 2;
          const SCALE  = 2.5;

          function b64ToUint8(b64) {
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return arr;
          }

          const container    = document.getElementById('pages');
          const progressWrap = document.getElementById('progress-wrap');
          const progressBar  = document.getElementById('progress-bar');
          const progressTxt  = document.getElementById('progress-txt');

          pdfjsLib.getDocument({ data: b64ToUint8(BASE64) }).promise.then(pdf => {
            const total = pdf.numPages;
            container.innerHTML = '';
            progressWrap.style.display = 'flex';
            let rendered = 0;

            const renderPage = (num) => {
              pdf.getPage(num).then(page => {
                const vp     = page.getViewport({ scale: SCALE * DPR });
                const canvas = document.createElement('canvas');
                const ctx    = canvas.getContext('2d');
                canvas.width        = vp.width;
                canvas.height       = vp.height;
                canvas.style.width  = '100%';
                canvas.style.height = 'auto';
                container.appendChild(canvas);

                page.render({ canvasContext: ctx, viewport: vp }).promise.then(() => {
                  rendered++;
                  const pct = Math.round((rendered / total) * 100);
                  progressBar.style.width = pct + '%';
                  progressTxt.textContent = rendered + ' / ' + total;
                  if (rendered === total) {
                    setTimeout(() => { progressWrap.style.display = 'none'; }, 800);
                  }
                  if (num < total) renderPage(num + 1);
                });
              });
            };
            renderPage(1);

          }).catch(err => {
            container.innerHTML = '<div id="msg">Erreur : ' + err.message + '</div>';
          });
        </script>
      </body>
    </html>
  ` : '';

  const htmlFinal = Platform.OS === 'ios' ? htmlIOS : htmlAndroid;

  return (
    <View style={S.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.couleurDark} />

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: theme.couleur }]}>
        <TouchableOpacity style={S.headerBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={S.headerTitre} numberOfLines={1}>{titre}</Text>
          <View style={S.headerSubRow}>
            <Ionicons name="document-text-outline" size={11} color="rgba(255,255,255,0.7)" />
            <Text style={S.headerSub}> {theme.subLabel}</Text>
          </View>
        </View>

        {etat === 'affichage' && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* ✅ Bouton QR code */}
            <TouchableOpacity style={S.headerBtn} onPress={() => setQrVisible(true)}>
              <Ionicons name="qr-code-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={S.headerBtn} onPress={telecharger}>
              <Ionicons name="download-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={S.headerBtn} onPress={partager}>
              <Ionicons name="share-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        {etat !== 'affichage' && <View style={{ width: 38 }} />}
      </View>

      {/* ── Barre de rôle ── */}
      <View style={[S.roleBar, { backgroundColor: theme.bgPale }]}>
        <Ionicons
          name={role === 'process' ? 'cog-outline' : 'flash-outline'}
          size={13}
          color={theme.couleur}
        />
        <Text style={[S.roleBarTxt, { color: theme.couleur }]}>{theme.label}</Text>
      </View>

      {/* ── Chargement ── */}
      {etat === 'chargement' && (
        <View style={S.centreWrap}>
          <ActivityIndicator size="large" color={theme.couleur} />
          <Text style={S.loaderTitre}>Chargement du PDF...</Text>
          <Text style={S.loaderSub}>Récupération depuis le serveur</Text>
        </View>
      )}

      {/* ── Erreur ── */}
      {etat === 'erreur' && (
        <View style={S.centreWrap}>
          <View style={[S.errIconWrap, { backgroundColor: theme.bgPale }]}>
            <Ionicons name="document-text-outline" size={48} color={theme.couleur} />
          </View>
          <Text style={S.errTitre}>Impossible d'afficher le PDF</Text>
          <Text style={S.errSub}>{erreurMsg}</Text>
          <TouchableOpacity style={[S.retryBtn, { backgroundColor: theme.couleur }]} onPress={chargerPDF}>
            <Ionicons name="refresh-outline" size={18} color="#fff" />
            <Text style={S.retryTxt}>Réessayer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.retryBtn, { backgroundColor: '#6B7280', marginTop: 10 }]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back-outline" size={18} color="#fff" />
            <Text style={S.retryTxt}>Retour</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── WebView ── */}
      {etat === 'affichage' && pdfBase64 && (
        <WebView
          ref={webViewRef}
          source={{ html: htmlFinal }}
          style={S.webview}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          mixedContentMode="always"
          allowFileAccess
          allowUniversalAccessFromFileURLs
          scrollEnabled
          showsVerticalScrollIndicator={false}
          bounces={false}
          onError={(e) => {
            console.error('WebView error:', e.nativeEvent);
            setErreurMsg("Erreur d'affichage du PDF.");
            setEtat('erreur');
          }}
        />
      )}

      {/* ── Modal QR ── */}
      <QrModal
        visible={qrVisible}
        onClose={() => setQrVisible(false)}
        qrValue={qrValue}
        titre={titre}
        theme={theme}
      />
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  header: {
    paddingTop: 50, paddingBottom: 12,
    paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center',
  },
  headerBtn: {
    width: 38, height: 38,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  headerTitre:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  headerSub:    { color: 'rgba(255,255,255,0.7)', fontSize: 10 },

  roleBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  roleBarTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  centreWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40,
  },
  loaderTitre: { fontSize: 15, fontWeight: '700', color: '#424242', marginTop: 16 },
  loaderSub:   { fontSize: 12, color: '#9E9E9E', marginTop: 6, textAlign: 'center' },

  errIconWrap: {
    width: 88, height: 88, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  errTitre: { fontSize: 16, fontWeight: '700', color: '#424242', marginTop: 8, textAlign: 'center' },
  errSub:   { fontSize: 13, color: '#9E9E9E', marginTop: 8, textAlign: 'center', lineHeight: 20 },

  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12,
    paddingHorizontal: 28, paddingVertical: 13, marginTop: 24,
  },
  retryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  webview: { flex: 1 },
});