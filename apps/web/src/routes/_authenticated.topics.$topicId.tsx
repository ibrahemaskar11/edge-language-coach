import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTopic } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/topics/$topicId")({
  component: TopicDetailPage,
});

function TopicDetailPage() {
  const { topicId } = Route.useParams();
  const { data: topic, isLoading } = useTopic(topicId);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="space-y-4">
        <Link to="/topics" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to Topics
        </Link>
        <p>Topic not found.</p>
      </div>
    );
  }

  const handleStartSession = () => {
    navigate({ to: "/session/$topicId", params: { topicId } });
  };

  return (
    <div className="space-y-8">
      <Link
        to="/topics"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        &larr; Back to Topics
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{topic.title}</h1>
          <Badge variant="secondary" className="text-xs">
            {topic.level}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {topic.category}
          </Badge>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Description
        </h2>
        <Card className="border-border/50">
          <CardContent className="p-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {topic.description}
            </p>
          </CardContent>
        </Card>
      </section>

      {topic.talkingPoints && topic.talkingPoints.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Talking Points
          </h2>
          <Card className="border-border/50">
            <CardContent className="space-y-3 p-5">
              {topic.talkingPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span>&bull;</span>
                  <span>{point}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      <Button onClick={handleStartSession}>
        Start Session →
      </Button>
    </div>
  );
}
