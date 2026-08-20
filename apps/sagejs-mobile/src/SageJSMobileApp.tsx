/* eslint-disable no-void */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { errorCodes, isErrorWithCode } from '@react-native-documents/picker';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Modal,
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import type { RuntimeSettings, ShareRequestPayload } from './bridge/protocol';
import { DocumentSidebar } from './components/DocumentSidebar';
import { SettingsSheet } from './components/SettingsSheet';
import { Toolbar } from './components/Toolbar';
import {
  newDocument,
  type WorksheetDocument,
  type WorksheetSummary,
} from './documents/model';
import { AsyncWorksheetRepository } from './documents/repository';
import {
  exportWorksheet,
  importWorksheet,
  importWorksheetFromUri,
  shareRuntimeContent,
  shareSource,
} from './documents/transfer';
import {
  RuntimeWebView,
  type RuntimeWebViewHandle,
} from './runtime/RuntimeWebView';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings/store';

const TABLET_SPLIT_WIDTH = 760;

export function SageJSMobileApp() {
  const repository = useMemo(() => new AsyncWorksheetRepository(), []);
  const runtime = useRef<RuntimeWebViewHandle>(null);
  const { width } = useWindowDimensions();
  const systemScheme = useColorScheme();
  const [active, setActive] = useState<WorksheetDocument>();
  const [recent, setRecent] = useState<WorksheetSummary[]>([]);
  const [settings, setSettings] = useState<RuntimeSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [lifecycle, setLifecycle] = useState<
    'active' | 'inactive' | 'background'
  >('active');
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeGeneration, setRuntimeGeneration] = useState(0);
  const [runtimeIdentity, setRuntimeIdentity] = useState('');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [documentsVisible, setDocumentsVisible] = useState(false);
  const isSplit = width >= TABLET_SPLIT_WIDTH;

  const report = useCallback((error: unknown) => {
    Alert.alert(
      'Sage.js',
      error instanceof Error ? error.message : String(error),
    );
  }, []);

  useEffect(() => {
    void Promise.all([repository.loadInitial(), loadSettings()]).then(
      ([initial, storedSettings]) => {
        setActive(initial.active);
        setRecent(initial.recent);
        setSettings(storedSettings);
      },
      report,
    );
  }, [report, repository]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const next = normalizeAppState(state);
      setLifecycle(next);
      runtime.current?.updateLifecycle(
        next,
        next === 'background' && settings.autoInterruptOnBackground,
      );
    });
    return () => subscription.remove();
  }, [settings.autoInterruptOnBackground]);

  useEffect(() => {
    const open = (url: string | null | undefined) => {
      if (!url || (!url.startsWith('file:') && !url.startsWith('content:')))
        return;
      const name = decodeURIComponent(url.split('/').pop() || 'Imported.sage');
      void importWorksheetFromUri(url, name).then(document => {
        setActive(document);
        runtime.current?.loadWorksheet(document);
        void repository.save(document).then(setRecent);
      }, report);
    };
    void Linking.getInitialURL().then(open, report);
    const subscription = Linking.addEventListener('url', event =>
      open(event.url),
    );
    return () => subscription.remove();
  }, [report, repository]);

  const persist = useCallback(
    (document: WorksheetDocument) => {
      void repository.save(document).then(setRecent, report);
    },
    [report, repository],
  );

  const updateSource = useCallback(
    (source: string, revision: number) => {
      setActive(current => {
        if (!current || revision < current.revision) return current;
        const next = {
          ...current,
          source,
          revision,
          updatedAt: new Date().toISOString(),
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const updateTitle = useCallback(
    (title: string) => {
      setActive(current => {
        if (!current) return current;
        const next = {
          ...current,
          title: title.slice(0, 160),
          updatedAt: new Date().toISOString(),
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const selectDocument = useCallback(
    (id: string) => {
      void repository.load(id).then(document => {
        setActive(document);
        runtime.current?.loadWorksheet(document);
        setDocumentsVisible(false);
      }, report);
    },
    [report, repository],
  );

  const createDocument = useCallback(() => {
    const document = newDocument();
    setActive(document);
    runtime.current?.loadWorksheet(document);
    persist(document);
  }, [persist]);

  const importDocument = useCallback(() => {
    void importWorksheet().then(
      document => {
        setActive(document);
        runtime.current?.loadWorksheet(document);
        persist(document);
      },
      error => {
        if (
          !isErrorWithCode(error) ||
          error.code !== errorCodes.OPERATION_CANCELED
        )
          report(error);
      },
    );
  }, [persist, report]);

  const updateRuntimeSettings = useCallback(
    (next: RuntimeSettings) => {
      setSettings(next);
      runtime.current?.updateSettings(next);
      void saveSettings(next).catch(report);
    },
    [report],
  );

  const onShareRequest = useCallback(
    (payload: ShareRequestPayload) => {
      void shareRuntimeContent(
        payload.suggestedName,
        payload.content,
        payload.kind,
      ).catch(report);
    },
    [report],
  );

  const dark =
    settings.appearance === 'dark' ||
    (settings.appearance === 'system' && systemScheme === 'dark');

  if (!active) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.loading}>
          <ActivityIndicator
            size="large"
            accessibilityLabel="Loading worksheets"
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const sidebar = (
    <DocumentSidebar
      recent={recent}
      activeId={active.id}
      onSelect={selectDocument}
    />
  );
  const snapshot = {
    id: active.id,
    title: active.title,
    source: active.source,
    revision: active.revision,
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={[styles.safeArea, dark && styles.dark]}>
        <Toolbar
          compact={!isSplit}
          runtimeReady={runtimeReady}
          onNew={createDocument}
          onImport={importDocument}
          onExport={() => void exportWorksheet(active).catch(report)}
          onShare={() => void shareSource(active).catch(report)}
          onInterrupt={() => runtime.current?.interrupt()}
          onSettings={() => setSettingsVisible(true)}
          onToggleDocuments={() => setDocumentsVisible(true)}
        />
        <View style={styles.workspace}>
          {isSplit ? <View style={styles.sidebarColumn}>{sidebar}</View> : null}
          <View style={styles.editorColumn}>
            <View style={styles.titleRow}>
              <TextInput
                accessibilityLabel="Worksheet title"
                value={active.title}
                onChangeText={updateTitle}
                selectTextOnFocus={false}
                style={styles.titleInput}
              />
              <Text
                accessibilityLabel="Runtime status"
                style={styles.runtimeStatus}
                numberOfLines={1}
              >
                {runtimeReady
                  ? `Offline · ${runtimeIdentity.slice(0, 18)}…`
                  : 'Starting offline runtime…'}
              </Text>
            </View>
            <RuntimeWebView
              key={runtimeGeneration}
              ref={runtime}
              worksheet={snapshot}
              settings={settings}
              lifecycle={lifecycle}
              onWorksheetChanged={updateSource}
              onShareRequest={onShareRequest}
              onRuntimeReady={runtimeEvidence => {
                setRuntimeReady(true);
                setRuntimeIdentity(runtimeEvidence.assetVersion);
              }}
              onRuntimeError={message => report(new Error(message))}
              onProcessRecovery={() => {
                setRuntimeReady(false);
                setRuntimeGeneration(generation => generation + 1);
              }}
            />
          </View>
        </View>
        <Modal
          visible={!isSplit && documentsVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setDocumentsVisible(false)}
        >
          <SafeAreaView style={styles.modalSidebar}>{sidebar}</SafeAreaView>
        </Modal>
        <SettingsSheet
          visible={settingsVisible}
          settings={settings}
          onChange={updateRuntimeSettings}
          onClose={() => setSettingsVisible(false)}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function normalizeAppState(
  state: AppStateStatus,
): 'active' | 'inactive' | 'background' {
  return state === 'active'
    ? 'active'
    : state === 'background'
    ? 'background'
    : 'inactive';
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#fbfbf8', flex: 1 },
  dark: { backgroundColor: '#171916' },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  workspace: { flex: 1, flexDirection: 'row' },
  sidebarColumn: { maxWidth: 320, minWidth: 230, width: '27%' },
  editorColumn: { flex: 1 },
  titleRow: {
    alignItems: 'center',
    backgroundColor: '#f8faf6',
    borderBottomColor: '#d4dad0',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  titleInput: {
    color: '#1d2b21',
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  runtimeStatus: { color: '#5e6961', fontSize: 11, maxWidth: '38%' },
  modalSidebar: { backgroundColor: '#f7f8f5', flex: 1 },
});
