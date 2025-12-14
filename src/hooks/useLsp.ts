import { useEffect, useRef } from 'react';
import { TauriMessageReader, TauriMessageWriter } from '../utils/lsp/connection';
import { createMessageConnection } from 'vscode-jsonrpc';
import { MonacoLanguageClient } from 'monaco-languageclient';
import { invoke } from '@tauri-apps/api/core';

export const useLsp = (languageId: string, cmd: string, args: string[]) => {
    const clientRef = useRef<MonacoLanguageClient | null>(null);

    useEffect(() => {
        const startLsp = async () => {
            try {
                // 1. Start Backend Process
                console.log(`Starting LSP for ${languageId}...`);
                await invoke('start_lsp', { languageId, cmd, args });

                // 2. Create RPC Connection
                const reader = new TauriMessageReader(languageId);
                const writer = new TauriMessageWriter(languageId);
                const connection = createMessageConnection(reader, writer);

                // 3. Create Monaco Language Client
                // Note: We are using 'any' cast here to bypass strict typing issues with monaco-languageclient versions
                // In production, we should properly type this or use MonacoServices.install()
                const client = new MonacoLanguageClient({
                    name: `${languageId} Language Client`,
                    clientOptions: {
                        documentSelector: [languageId],
                        errorHandler: {
                            error: () => ({ action: 2 }), // 2 = Shutdown
                            closed: () => ({ action: 1 }), // 1 = DoNotRestart
                        },
                    },
                    // @ts-ignore: connectionProvider might not be in the type definition but is required by logic
                    connectionProvider: {
                        get: async () => connection
                    }
                });

                client.start();
                clientRef.current = client;
                console.log(`LSP Client for ${languageId} started.`);

            } catch (e) {
                console.error(`Failed to start LSP for ${languageId}:`, e);
            }
        };

        // Disable LSP start for now to prevent crashes until fully configured
        // startLsp();

        return () => {
             // invoke('kill_lsp', { languageId }).catch(console.error);
        };
    }, []); 
};