import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Empty, TopBar } from "../components/ui";

export function NotFound() {
  return (
    <>
      <TopBar title="" />
      <Empty
        icon={<Compass className="size-7" />}
        title="Page introuvable"
        text="Ce lien ne mène nulle part. L'événement a peut-être été retiré."
        action={
          <Link to="/">
            <Button>Retour à l'accueil</Button>
          </Link>
        }
      />
    </>
  );
}
