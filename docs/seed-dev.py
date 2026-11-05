#!/usr/bin/env python3
"""Posts sample jobs to the local app. Usage: ADMIN_TOKEN=dev-admin python3 docs/seed-dev.py [base_url]"""
import json, os, sys, urllib.request, urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
TOKEN = os.environ.get("ADMIN_TOKEN", "dev-admin")

JOBS = [
    ("Senior Java Engineer, Platform Team", "Acme Corp", "Hyderabad", "Telangana", "HYBRID", 7, None, ["java", "spring-boot", "kafka", "docker", "aws", "kubernetes", "postgresql"], 1800000, 2500000, "INR", "YEARLY", "LINKEDIN"),
    ("Backend Engineer (Kotlin)", "Globex", "Bengaluru", "Karnataka", "REMOTE", 3, 6, ["kotlin", "spring-boot", "postgresql", "docker"], 1500000, 2200000, "INR", "YEARLY", "NAUKRI"),
    ("Full Stack Developer", "Initech", "Pune", "Maharashtra", "ONSITE", 2, 4, ["react", "node-js", "typescript", "mongodb"], None, None, None, None, "COMPANY_SITE"),
    ("Staff Software Engineer, Distributed Systems", "Umbrella Systems International Private Limited", "Chennai", "Tamil Nadu", "HYBRID", 10, None, ["java", "kafka", "kubernetes", "aws", "terraform", "redis"], 4000000, None, "INR", "YEARLY", "LINKEDIN"),
    ("Frontend Engineer", "Hooli", "Bengaluru", "Karnataka", "HYBRID", 4, 7, ["react", "typescript", "next-js", "graphql"], 2000000, 3000000, "INR", "YEARLY", "LINKEDIN"),
    ("Go Developer", "Pied Piper", "Remote", None, "REMOTE", 3, 5, ["go", "postgresql", "docker", "gcp"], 4000, 6000, "USD", "MONTHLY", "OTHER"),
    (".NET Developer", "Wayne Enterprises", "Dubai", None, "ONSITE", 5, 8, ["dotnet", "csharp", "sql-server", "azure"], 15000, 20000, "AED", "MONTHLY", "OTHER"),
    ("Python Data Engineer", "Stark Industries", "Hyderabad", "Telangana", "HYBRID", 5, 9, ["python", "spark", "airflow", "aws"], None, None, None, None, "NAUKRI"),
    ("DevOps Engineer", "Soylent", "Noida", "Uttar Pradesh", "ONSITE", 3, 6, ["kubernetes", "terraform", "jenkins", "aws", "docker"], None, None, None, None, "NAUKRI"),
    ("Junior Java Developer", "Cyberdyne", "Hyderabad", "Telangana", "ONSITE", 0, 2, ["java", "spring-boot", "mysql"], None, None, None, None, "COMPANY_SITE"),
    ("Engineering Manager, Payments", "Massive Dynamic", "Mumbai", "Maharashtra", "HYBRID", 12, 16, ["java", "kafka", "aws"], 6000000, 8000000, "INR", "YEARLY", "LINKEDIN"),
    ("Mobile Engineer (React Native)", "Tyrell", "Bengaluru", "Karnataka", "REMOTE", 3, None, ["react-native", "typescript", "react"], None, None, None, None, "LINKEDIN"),
]

def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", "X-Admin-Token": TOKEN})
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": e.read().decode()}

for i, (title, company, city, state, mode, mn, mx, tags, smin, smax, cur, per, src) in enumerate(JOBS):
    res = call("POST", "/api/admin/jobs", {
        "title": title, "companyName": company, "description": f"## About the role\n\nWe are hiring a **{title}** at {company}.\n\n- Build and ship production services\n- Work with {', '.join(tags)}\n- Collaborate with product and design\n\n## Requirements\n\n- {mn}+ years of relevant experience\n- Strong fundamentals and good communication",
        "applyUrl": f"https://example.com/careers/{i + 1}", "source": src, "locationCity": city, "locationState": state,
        "locationCountry": "India" if city != "Dubai" and city != "Remote" else None, "workMode": mode,
        "experienceMinYears": mn, "experienceMaxYears": mx, "salaryMin": smin, "salaryMax": smax,
        "salaryCurrency": cur, "salaryPeriod": per, "tags": tags,
        "postedAt": None,
    })
    print(res.get("slug") or res)
