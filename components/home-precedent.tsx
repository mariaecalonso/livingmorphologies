const TYPES = [
  {
    id: "lobby",
    label: "Lobby — 5 Typologies",
    src: "/precedent/lobby.png",
    alt: "Lobby typology rule diagram: contain, orient, release.",
  },
  {
    id: "workspace",
    label: "Workspace — 5 Typologies",
    src: "/precedent/workspace.png",
    alt: "Workspace axon labeled structure as organizer, with glass facade, workspace, and structural columns.",
  },
  {
    id: "gathering",
    label: "Gathering — 5 Typologies",
    src: "/precedent/gathering.png",
    alt: "Gathering axon of a void within a volume.",
  },
] as const;

const FAMILIES = [
  {
    id: "formal",
    title: "Formal / Geometrical",
    items: ["Open Volume", "Layered Field", "Extended Axis"],
  },
  {
    id: "spatial",
    title: "Organizational / Spatial",
    items: ["Central Focus", "Flexible Module", "Distributed Movement"],
  },
  {
    id: "atmospheric",
    title: "Experiential / Atmospheric",
    items: ["Visual Exchange", "Dynamic Collaboration", "Dramatic Visual Contrast"],
  },
] as const;

export function HomePrecedent() {
  return (
    <div className="home-precedent">
      <div className="home-precedent-lead">
        <figure className="home-precedent-frame home-precedent-anchor">
          <figcaption>Axel Springer Analysis</figcaption>
          <img
            src="/precedent/axel-section.png"
            alt="Experiential spatial analysis section of Axel Springer Campus, comparing visual connectivity and noise levels."
          />
        </figure>
        <figure className="home-precedent-frame home-precedent-program">
          <figcaption>Program / Spatial Organization</figcaption>
          <img
            src="/precedent/program-stacks.png"
            alt="Program analysis stacked floor diagrams for collaboration, vertical circulation, public and private areas, companies, and activity density."
          />
        </figure>
      </div>
      <div className="home-precedent-types">
        <p className="home-precedent-kicker">Typology Extraction</p>
        <div className="home-precedent-type-row">
          {TYPES.map((type) => (
            <figure className="home-precedent-frame home-precedent-type" key={type.id}>
              <figcaption>{type.label}</figcaption>
              <img src={type.src} alt={type.alt} />
            </figure>
          ))}
        </div>
      </div>
      <aside className="home-precedent-frame home-precedent-descriptors">
        <p className="home-precedent-kicker">Descriptor Extraction</p>
        <div className="home-precedent-families">
          {FAMILIES.map((family) => (
            <section key={family.id} data-family={family.id}>
              <h3>{family.title}</h3>
              <ul>
                {family.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
