# Ella Rises – INTEX Fall 2025

## Group Members of 1-15
- Phoenix Fisher
- Jake Fuhriman
- Carson Oliver

## Summary

This project delivers a full-stack, data-driven platform for Ella Rises, a nonprofit focused on empowering young women in STEAM fields. The system includes a deployed Node/Express web application, an AWS-hosted relational database, and an analytics dashboard used to evaluate event impact and participant success.

## Project Overview
Ella Rises collects event, survey, and milestone data to measure program effectiveness. This application allows administrators to manage data, analyze participant outcomes, and produce insights for leadership, donors, and partners.

## Features

### Web Application (Node + Express)
- Secure login with role-based access (manager vs. common user)
- CRUD functionality for participants, events, surveys, milestones, and donations
- Server-side rendering using EJS
- Security middleware including bcrypt, helmet, csurf, and connect-flash
- Optional emailing support with nodemailer

### Database (PostgreSQL/MySQL)
- Fully normalized to 3rd Normal Form
- Entity-Relationship Diagram included
- SQL scripts for schema creation and data loading
- Hosted using AWS RDS

### Analytics Dashboard
- Interactive charts and KPIs related to STEAM success outcomes
- Filters for event type and participant demographics
- Embedded directly into the website

### Deployment (AWS)
- Hosted using AWS services such as Elastic Beanstalk and RDS
- Custom domain via Route 53
- HTTPS enabled
- One endpoint returns HTTP 418 as required

## Data Analysis
Python-based exploratory data analysis was used to identify indicators that inspire milestone achievement. The analysis includes data cleaning, univariate and bivariate exploration, and visualizations that informed key presentation insights.

## Repository Contents
- src/ – Node/Express application
- views/ – EJS templates
- public/ – static assets
- database/ – SQL scripts, normalization steps, ERD
- analysis/ – Python EDA notebook
- docs/ – presentation slides, videos, and AI feedback

