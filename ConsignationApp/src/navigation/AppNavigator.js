// src/navigation/AppNavigator.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// ── Auth
import Login             from '../components/auth/login';
import ChangerMotDePasse from '../components/auth/changemotpas';

// ── Agent
import Agent              from '../components/agent/agent';
import NouvelleDemande    from '../components/agent/nouvelleDemande';
import MesDemandes        from '../components/agent/mesDemandes';
import NotificationsAgent from '../components/agent/notificationsAgent';
import ProfilAgent        from '../components/agent/profilAgent';
import DetailDemandes     from '../components/agent/detailDemande';

// ── Chef Production
import ChefProd      from '../components/chefProd/chefProd';
import Validation    from '../components/chefProd/validation';
import RemiseService from '../components/chefProd/remiseService';

// ── HSE
import Hse        from '../components/hse/hse';
import CreerPlan  from '../components/hse/creerPlan';
import ApercuPlan from '../components/hse/apercuPlan';

// ── Électricien
import Electricien    from '../components/electricien/electricien';
import Execution      from '../components/electricien/execution';
import Deconsignation from '../components/electricien/deconsignation';

// ── Chef Électricien
import ChefElec     from '../components/chefElec/chefElec';
import Verification from '../components/chefElec/verification';

// ── Chef Intervenant ──────────────────────────────────────────────
import DashboardChef          from '../components/chefIntervenant/dashboardChef';
import DetailConsignationChef from '../components/chefIntervenant/detailConsignation';
import MonEquipe              from '../components/chefIntervenant/monEquipe';
import FinIntervention        from '../components/chefIntervenant/finIntervention';
import NotificationsChef      from '../components/chefIntervenant/notifications';
import ProfilChef             from '../components/chefIntervenant/profil';
import DeconsignationEquipe   from '../components/chefIntervenant/deconsignationEquipe';
import GestionEquipe          from '../components/chefIntervenant/GestionEquipe';
import ScanCadenasEquipe      from '../components/chefIntervenant/ScanCadenasEquipe';
import ScanBadgeEquipe        from '../components/chefIntervenant/ScanBadgeEquipe';
import PrendrePhotoEquipe     from '../components/chefIntervenant/PrendrePhotoEquipe';

// ── Chef Intervenant — screens supplémentaires
import MesConsignationsChef from '../components/chefIntervenant/mesConsignationsChef'; // ✅ NOUVEAU

// ── Chargé de consignation
import DashboardCharge     from '../components/charge/dashboardCharge';
import MesDemandesCharge   from '../components/charge/mesDemandes';
import DetailConsignation  from '../components/charge/detailConsignation';
import ScanBadgeNFC        from '../components/charge/scanBadgeNFC';
import ScanCadenasNFC      from '../components/charge/scanCadenasNFC';
import PrendrePhoto        from '../components/charge/prendrePhoto';
import ValiderConsignation from '../components/charge/validerConsignation';
import NotificationsCharge from '../components/charge/notificationsCharge';
import ProfilCharge        from '../components/charge/profilCharge';
import HistoriqueCharge    from '../components/charge/historiqueCharge';

// ── Chef Process
import DashboardProcess          from '../components/process/dashboardProcess';
import MesDemandesProcess        from '../components/process/mesDemandesProcess'; // ✅ NOUVEAU
import DetailConsignationProcess from '../components/process/detailConsignationProcess';
import ScanCadenasProcess        from '../components/process/scanCadenasProcess';
import ValiderProcess            from '../components/process/validerProcess';
import NotificationsProcess      from '../components/process/notificationsProcess';
import ProfilProcess             from '../components/process/profilProcess';
import HistoriqueProcess         from '../components/process/historiqueProcess';

// ── Admin
import Admin        from '../components/admin/admin';
import Utilisateurs from '../components/admin/utilisateurs';
import Equipements  from '../components/admin/equipements';

// ── Shared
import DetailDemande from '../components/shared/detailDemande';
import PdfViewer     from '../components/shared/pdfViewer';

const Stack = createStackNavigator();
const O = { headerShown: false };

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={O}>
      <Stack.Screen name="Login"             component={Login} />
      <Stack.Screen name="ChangerMotDePasse" component={ChangerMotDePasse} />
    </Stack.Navigator>
  );
}

export function AgentNavigator() {
  return (
    <Stack.Navigator screenOptions={O}>
      <Stack.Screen name="Agent"             component={Agent} />
      <Stack.Screen name="NouvelleDemande"   component={NouvelleDemande} />
      <Stack.Screen name="MesDemandes"       component={MesDemandes} />
      <Stack.Screen name="DetailDemande"     component={DetailDemande} />
      <Stack.Screen name="Notifications"     component={NotificationsAgent} />
      <Stack.Screen name="Profil"            component={ProfilAgent} />
      <Stack.Screen name="ChangerMotDePasse" component={ChangerMotDePasse} />
      <Stack.Screen name="PdfViewer"         component={PdfViewer} />
      <Stack.Screen name="DetailDemandes"    component={DetailDemandes} />
    </Stack.Navigator>
  );
}

export function ChefProdNavigator() {
  return (
    <Stack.Navigator screenOptions={O}>
      <Stack.Screen name="ChefProd"          component={ChefProd} />
      <Stack.Screen name="Validation"        component={Validation} />
      <Stack.Screen name="RemiseService"     component={RemiseService} />
      <Stack.Screen name="DetailDemande"     component={DetailDemande} />
      <Stack.Screen name="ChangerMotDePasse" component={ChangerMotDePasse} />
    </Stack.Navigator>
  );
}

export function HseNavigator() {
  return (
    <Stack.Navigator screenOptions={O}>
      <Stack.Screen name="Hse"               component={Hse} />
      <Stack.Screen name="CreerPlan"         component={CreerPlan} />
      <Stack.Screen name="ApercuPlan"        component={ApercuPlan} />
      <Stack.Screen name="DetailDemande"     component={DetailDemande} />
      <Stack.Screen name="ChangerMotDePasse" component={ChangerMotDePasse} />
    </Stack.Navigator>
  );
}

export function ElecNavigator() {
  return (
    <Stack.Navigator screenOptions={O}>
      <Stack.Screen name="Electricien"       component={Electricien} />
      <Stack.Screen name="Execution"         component={Execution} />
      <Stack.Screen name="Deconsignation"    component={Deconsignation} />
      <Stack.Screen name="DetailDemande"     component={DetailDemande} />
      <Stack.Screen name="ChangerMotDePasse" component={ChangerMotDePasse} />
    </Stack.Navigator>
  );
}

export function ChefElecNavigator() {
  return (
    <Stack.Navigator screenOptions={O}>
      <Stack.Screen name="ChefElec"          component={ChefElec} />
      <Stack.Screen name="Verification"      component={Verification} />
      <Stack.Screen name="DetailDemande"     component={DetailDemande} />
      <Stack.Screen name="ChangerMotDePasse" component={ChangerMotDePasse} />
    </Stack.Navigator>
  );
}

// ─── CHEF INTERVENANT ──────────────────────────────────────────────
export function ChefIntNavigator() {
  return (
    <Stack.Navigator screenOptions={O}>
      <Stack.Screen name="DashboardChef"           component={DashboardChef} />
      {/* ✅ MesConsignationsChef : liste complète avec filtres et recherche */}
      <Stack.Screen name="MesConsignationsChef"    component={MesConsignationsChef} />
      <Stack.Screen name="DetailConsignation"      component={DetailConsignationChef} />
      <Stack.Screen name="MonEquipe"            component={MonEquipe} />
      <Stack.Screen name="FinIntervention"      component={FinIntervention} />
      <Stack.Screen name="NotificationsChef"    component={NotificationsChef} />
      <Stack.Screen name="DeconsignationEquipe" component={DeconsignationEquipe} />
      <Stack.Screen name="PdfViewer"            component={PdfViewer} />
      <Stack.Screen name="DetailDemande"        component={DetailDemande} />
      <Stack.Screen name="Profil"               component={ProfilChef} />
      <Stack.Screen name="ChangerMotDePasse"    component={ChangerMotDePasse} />
      <Stack.Screen name="GestionEquipe"        component={GestionEquipe} />
      <Stack.Screen name="ScanCadenasEquipe"    component={ScanCadenasEquipe} />
      <Stack.Screen name="ScanBadgeEquipe"      component={ScanBadgeEquipe} />
      <Stack.Screen name="PrendrePhotoEquipe"   component={PrendrePhotoEquipe} />
    </Stack.Navigator>
  );
}

// ─── CHARGÉ DE CONSIGNATION ────────────────────────────────────────
export function ChargeNavigator() {
  return (
    <Stack.Navigator screenOptions={O}>
      <Stack.Screen name="DashboardCharge"     component={DashboardCharge} />
      <Stack.Screen name="MesDemandesCharge"   component={MesDemandesCharge} />
      <Stack.Screen name="DetailConsignation"  component={DetailConsignation} />
      <Stack.Screen name="ScanBadgeNFC"        component={ScanBadgeNFC} />
      <Stack.Screen name="ScanCadenasNFC"      component={ScanCadenasNFC} />
      <Stack.Screen name="PrendrePhoto"        component={PrendrePhoto} />
      <Stack.Screen name="ValiderConsignation" component={ValiderConsignation} />
      <Stack.Screen name="Notifications"       component={NotificationsCharge} />
      <Stack.Screen name="Profil"              component={ProfilCharge} />
      <Stack.Screen name="ChangerMotDePasse"   component={ChangerMotDePasse} />
      <Stack.Screen name="Historique"          component={HistoriqueCharge} />
      <Stack.Screen name="PdfViewer"           component={PdfViewer} />
    </Stack.Navigator>
  );
}

// ─── CHEF PROCESS ──────────────────────────────────────────────────
export function ProcessNavigator() {
  return (
    <Stack.Navigator screenOptions={O}>
      <Stack.Screen name="DashboardProcess"          component={DashboardProcess} />
      {/* ✅ MesDemandesProcess : liste des demandes actives avec filtres */}
      <Stack.Screen name="MesDemandesProcess"        component={MesDemandesProcess} />
      <Stack.Screen name="DetailConsignationProcess" component={DetailConsignationProcess} />
      <Stack.Screen name="ScanCadenasProcess"        component={ScanCadenasProcess} />
      <Stack.Screen name="ValiderProcess"            component={ValiderProcess} />
      <Stack.Screen name="NotificationsProcess"      component={NotificationsProcess} />
      <Stack.Screen name="Profil"                    component={ProfilProcess} />
      <Stack.Screen name="ChangerMotDePasse"         component={ChangerMotDePasse} />
      <Stack.Screen name="HistoriqueProcess"         component={HistoriqueProcess} />
      <Stack.Screen name="PdfViewer"                 component={PdfViewer} />
    </Stack.Navigator>
  );
}

// ─── ADMIN ─────────────────────────────────────────────────────────
export function AdminNavigator() {
  return (
    <Stack.Navigator screenOptions={O}>
      <Stack.Screen name="Admin"             component={Admin} />
      <Stack.Screen name="Utilisateurs"      component={Utilisateurs} />
      <Stack.Screen name="Equipements"       component={Equipements} />
      <Stack.Screen name="ChangerMotDePasse" component={ChangerMotDePasse} />
    </Stack.Navigator>
  );
}

// ─── NAVIGATEUR PRINCIPAL ──────────────────────────────────────────
export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={O} initialRouteName="AuthStack">
      <Stack.Screen name="AuthStack"     component={AuthNavigator} />
      <Stack.Screen name="AgentStack"    component={AgentNavigator} />
      <Stack.Screen name="ChefProdStack" component={ChefProdNavigator} />
      <Stack.Screen name="HseStack"      component={HseNavigator} />
      <Stack.Screen name="ElecStack"     component={ElecNavigator} />
      <Stack.Screen name="ChefElecStack" component={ChefElecNavigator} />
      <Stack.Screen name="ChefIntStack"  component={ChefIntNavigator} />
      <Stack.Screen name="ChargeStack"   component={ChargeNavigator} />
      <Stack.Screen name="ProcessStack"  component={ProcessNavigator} />
      <Stack.Screen name="AdminStack"    component={AdminNavigator} />
    </Stack.Navigator>
  );
}