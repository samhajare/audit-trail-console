import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: { compactLayout: false },
  reducers: {
    toggleCompactLayout(state) {
      state.compactLayout = !state.compactLayout;
    },
  },
});

export const { toggleCompactLayout } = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
