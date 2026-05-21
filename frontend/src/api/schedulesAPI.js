import api from './client';

export const schedulesAPI = {
  // PPE
  getPPE:         (eid)       => api.get(`/schedules/${eid}/ppe`),
  savePPE:        (eid,id,d)  => api.put(`/schedules/${eid}/ppe/${id}`, d),
  addPPE:         (eid,d)     => api.post(`/schedules/${eid}/ppe`, d),
  deletePPE:      (eid,id)    => api.delete(`/schedules/${eid}/ppe/${id}`),

  // Intangibles
  getIntangibles:    (eid)       => api.get(`/schedules/${eid}/intangibles`),
  saveIntangible:    (eid,id,d)  => api.put(`/schedules/${eid}/intangibles/${id}`, d),
  addIntangible:     (eid,d)     => api.post(`/schedules/${eid}/intangibles`, d),
  deleteIntangible:  (eid,id)    => api.delete(`/schedules/${eid}/intangibles/${id}`),

  // Related Party
  getRelatedParties: (eid)           => api.get(`/schedules/${eid}/related-parties`),
  addParty:          (eid,d)         => api.post(`/schedules/${eid}/related-parties`, d),
  updateParty:       (eid,id,d)      => api.put(`/schedules/${eid}/related-parties/${id}`, d),
  deleteParty:       (eid,id)        => api.delete(`/schedules/${eid}/related-parties/${id}`),
  addTransaction:    (eid,pid,d)     => api.post(`/schedules/${eid}/related-parties/${pid}/transactions`, d),
  updateTransaction: (eid,tid,d)     => api.put(`/schedules/${eid}/transactions/${tid}`, d),
  deleteTransaction: (eid,tid)       => api.delete(`/schedules/${eid}/transactions/${tid}`),

  // EPS
  getEPS:  (eid)   => api.get(`/schedules/${eid}/eps`),
  saveEPS: (eid,d) => api.put(`/schedules/${eid}/eps`, d),

  // Deferred Tax
  getDeferredTax:    (eid)      => api.get(`/schedules/${eid}/deferred-tax`),
  addDTItem:         (eid,d)    => api.post(`/schedules/${eid}/deferred-tax`, d),
  saveDTItem:        (eid,id,d) => api.put(`/schedules/${eid}/deferred-tax/${id}`, d),
  deleteDTItem:      (eid,id)   => api.delete(`/schedules/${eid}/deferred-tax/${id}`),

  // Financial Instruments
  getFinInstruments:  (eid)   => api.get(`/schedules/${eid}/financial-instruments`),
  saveFinInstruments: (eid,d) => api.put(`/schedules/${eid}/financial-instruments`, d),

  // Contingencies
  getContingencies:  (eid)      => api.get(`/schedules/${eid}/contingencies`),
  addContingency:    (eid,d)    => api.post(`/schedules/${eid}/contingencies`, d),
  saveContingency:   (eid,id,d) => api.put(`/schedules/${eid}/contingencies/${id}`, d),
  deleteContingency: (eid,id)   => api.delete(`/schedules/${eid}/contingencies/${id}`),
};
