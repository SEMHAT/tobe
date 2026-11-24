import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Onboarding } from "./pages/Onboarding";
import { Home } from "./pages/Home";
import { Explorer } from "./pages/Explorer";
import { EventPage } from "./pages/Event";
import { Checkout } from "./pages/Checkout";
import { Tickets, TicketPage } from "./pages/Tickets";
import { Create } from "./pages/Create";
import { ContestPage, CandidatePage, CertificatePage } from "./pages/Contest";
import { CagnottePage } from "./pages/Cagnotte";
import { Photos } from "./pages/Photos";
import { Profile, Notifications } from "./pages/Profile";
import { Organizer, OrganizerEvent, Scanner } from "./pages/Organizer";
import { Providers } from "./pages/Providers";
import { TobeAdmin } from "./pages/Admin";
import { NotFound } from "./pages/NotFound";
import { Club } from "./pages/Club";
import { Invitation } from "./pages/Invitation";
import { EditEvent } from "./pages/EditEvent";
import { PaymentReturn } from "./pages/PaymentReturn";
import { Safety } from "./pages/Safety";
import { isCrawler } from "./lib/seo";

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
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/prestataires" element={<Providers />} />
          <Route path="/tobe" element={<TobeAdmin />} />
          <Route path="/club" element={<Club />} />
          <Route path="/invitation/:token" element={<Invitation />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
