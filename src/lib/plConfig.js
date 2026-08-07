// /pl-test (Polonya Ekstraklasa) için SquadProvider yapılandırması.
// Aynı Takımım/Transfer bileşenlerini PL verisi + izole tablolarla çalıştırır.
// Modül düzeyinde SABİT nesne (her render'da yeniden kurulmaz → effect'ler stabil).

import { buildWeeks } from './weeks.js'
import { loadPlPlayers, loadPlFixtures, PL_PICKER_CLUBS } from './plTest.js'
import {
  loadPlSquad, savePlSquad, loadPlOverrides,
  loadPlPrevSquad, loadPlTransferMeta, savePlTransferMeta,
} from './plTestDb.js'

export const PL_CONFIG = {
  loadFixtures: loadPlFixtures,
  loadPlayers: loadPlPlayers,
  buildWeeks,
  loadSquad: loadPlSquad,
  saveSquad: savePlSquad,
  loadPrevSquad: loadPlPrevSquad,
  loadTransferMeta: loadPlTransferMeta,
  saveTransferMeta: savePlTransferMeta,
  loadOverrides: loadPlOverrides,
  routes: { squad: '/pl-test', transfer: '/pl-test/transfer' },
  pickerClubs: PL_PICKER_CLUBS, // Transfer picker yalnızca bu kulüpleri gösterir (havuz 18, picker 14)
}
