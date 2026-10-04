import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { baseApi } from '../../services/baseApi';
import { uiReducer } from './uiSlice';
import { liveReducer } from '../../features/live/liveSlice';
import { tokenSession, type TokenSession } from '../../auth/tokenSession';

export const createAppStore = (session: TokenSession = tokenSession) =>
  configureStore({
    reducer: {
      ui: uiReducer,
      live: liveReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: { extraArgument: { tokenSession: session } },
      }).concat(baseApi.middleware),
  });

export const store = createAppStore();
setupListeners(store.dispatch);
export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
