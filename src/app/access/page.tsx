import AccessForm from "./AccessForm";
export default function AccessPage() {
  const local = process.env.NODE_ENV === "development" && !process.env.DEMO_PIN_HASH;
  return <AccessForm local={local}/>;
}
