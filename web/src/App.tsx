import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Explorer } from "./pages/Explorer";
import { EventPage } from "./pages/Event";
import { NotFound } from "./pages/NotFound";
import { isCrawler } from "./lib/seo";
import { lazy } from "react";

// Pages chargées à la demande : l'accueil, l'agenda et les événements s'ouvrent plus vite sur mobile.
const Checkout = lazy(() => import("./pages/Checkout").then((m) => ({ default: m.Checkout })));
const Tickets = lazy(() => import("./pages/Tickets").then((m) => ({ default: m.Tickets })));
const TicketPage = lazy(() => import("./pages/Tickets").then((m) => ({ default: m.TicketPage })));
const Create = lazy(() => import("./pages/Create").then((m) => ({ default: m.Create })));
const ContestPage = lazy(() => import("./pages/Contest").then((m) => ({ default: m.ContestPage })));
const CandidatePage = lazy(() => import("./pages/Contest").then((m) => ({ default: m.CandidatePage })));
const CertificatePage = lazy(() => import("./pages/Contest").then((m) => ({ default: m.CertificatePage })));
const CagnottePage = lazy(() => import("./pages/Cagnotte").then((m) => ({ default: m.CagnottePage })));
const Photos = lazy(() => import("./pages/Photos").then((m) => ({ default: m.Photos })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const Notifications = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Notifications })));
const Organizer = lazy(() => import("./pages/Organizer").then((m) => ({ default: m.Organizer })));
const OrganizerEvent = lazy(() => import("./pages/Organizer").then((m) => ({ default: m.OrganizerEvent })));
const Scanner = lazy(() => import("./pages/Organizer").then((m) => ({ default: m.Scanner })));
const Providers = lazy(() => import("./pages/Providers").then((m) => ({ default: m.Providers })));
const TobeAdmin = lazy(() => import("./pages/Admin").then((m) => ({ default: m.TobeAdmin })));
const Club = lazy(() => import("./pages/Club").then((m) => ({ default: m.Club })));
const Invitation = lazy(() => import("./pages/Invitation").then((m) => ({ default: m.Invitation })));
const EditEvent = lazy(() => import("./pages/EditEvent").then((m) => ({ default: m.EditEvent })));
const PaymentReturn = lazy(() => import("./pages/PaymentReturn").then((m) => ({ default: m.PaymentReturn })));
const Safety = lazy(() => import("./pages/Safety").then((m) => ({ default: m.Safety })));
const GroupPage = lazy(() => import("./pages/Group").then((m) => ({ default: m.GroupPage })));
const Observatory = lazy(() => import("./pages/Observatory").then((m) => ({ default: m.Observatory })));
const Privacy = lazy(() => import("./pages/Privacy").then((m) => ({ default: m.Privacy })));
const GuestConsent = lazy(() => import("./pages/GuestConsent").then((m) => ({ default: m.GuestConsent })));
const Lome = lazy(() => import("./pages/Lome").then((m) => ({ default: m.Lome })));
const Agency = lazy(() => import("./pages/Agency").then((m) => ({ default: m.Agency })));
const Onboarding = lazy(() => import("./pages/Onboarding").then((m) => ({ default: m.Onboarding })));

function HomeGate() {
  const loc = useLocation();
  if (!isCrawler() && !localStorage.getItem("tobe-onboarded") && window.matchMedia("(max-width: 1023px)").matches) return <Navigate to="/bienvenue" replace state={{ from: loc.pathname }} />;
  return <Home />;
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/bienvenue" element={<Onboarding />} />
          <Route path="/" element={<HomeGate />} />
          <Route path="/explorer" element={<Explorer />} />
          <Route path="/evenement/:id" element={<EventPage />} />
          <Route path="/evenement/:id/billets" element={<Checkout />} />
          <Route path="/billets" element={<Tickets />} />
          <Route path="/billet/:id" element={<TicketPage />} />
          <Route path="/creer" element={<Create />} />
          <Route path="/vote/:id" element={<ContestPage />} />
          <Route path="/vote/:id/candidat/:cid" element={<CandidatePage />} />
          <Route path="/vote/:id/certificat" element={<CertificatePage />} />
          <Route path="/cagnotte/:id" element={<CagnottePage />} />
          <Route path="/photos" element={<Photos />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/organisateur" element={<Organizer />} />
          <Route path="/organisateur/:id" element={<OrganizerEvent />} />
          <Route path="/organisateur/:id/modifier" element={<EditEvent />} />
          <Route path="/paiement/:id" element={<PaymentReturn />} />
          <Route path="/securite" element={<Safety />} />
          <Route path="/groupe/:code" element={<GroupPage />} />
          <Route path="/observatoire" element={<Observatory />} />
          <Route path="/confidentialite" element={<Privacy />} />
          <Route path="/visage/:code" element={<GuestConsent />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/prestataires" element={<Providers />} />
          <Route path="/organiser" element={<Agency />} />
          <Route path="/evenements-a-lome" element={<Lome />} />
          <Route path="/tobe" element={<TobeAdmin />} />
          <Route path="/club" element={<Club />} />
          <Route path="/invitation/:token" element={<Invitation />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
