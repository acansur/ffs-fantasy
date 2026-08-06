// /pl-test (Polonya Ekstraklasa) için SquadProvider yapılandırması.
// Aynı Takımım/Transfer bileşenlerini PL verisi + izole tablolarla çalıştırır.
// Modül düzeyinde SABİT nesne (her render'da yeniden kurulmaz → effect'ler stabil).

import { buildWeeks } from './weeks.js'
import { loadPlPlayers, loadPlFixtures } from './plTest.js'
import { loadPlSquad, savePlSquad, loadPlOverrides } from './plTestDb.js'

export const PL_CONFIG = {
  loadFixtures: loadPlFixtures,
  loadPlayers: loadPlPlayers,
  buildWeeks,
  loadSquad: loadPlSquad,
  saveSquad: savePlSquad,
  loadOverrides: loadPlOverrides,
  routes: { squad: '/pl-test', transfer: '/pl-test/transfer' },
}
