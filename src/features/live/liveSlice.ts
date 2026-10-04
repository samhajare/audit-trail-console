import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ConnectionStatus =
  'stopped' | 'connecting' | 'connected' | 'reconnecting' | 'error';
const liveSlice = createSlice({
  name: 'live',
  initialState: {
    enabled: false,
    status: 'stopped' as ConnectionStatus,
    message: '',
  },
  reducers: {
    setLiveEnabled(state, action: PayloadAction<boolean>) {
      state.enabled = action.payload;
    },
    setLiveStatus(
      state,
      action: PayloadAction<{ status: ConnectionStatus; message?: string }>,
    ) {
      state.status = action.payload.status;
      state.message = action.payload.message ?? '';
    },
  },
});
export const { setLiveEnabled, setLiveStatus } = liveSlice.actions;
export const liveReducer = liveSlice.reducer;
