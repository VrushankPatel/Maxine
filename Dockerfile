FROM ubuntu:latest
RUN apt-get update && apt-get install wget -y
LABEL org.opencontainers.image.author="Susheel Pal"
RUN mkdir -p ~/Scripts
WORKDIR /Scripts
RUN wget https://github.com/VrushankPatel/Maxine-Server/releases/download/v2.0.0/maxine-discovery-linux
RUN chmod +x maxine-discovery-linux
EXPOSE 8080
CMD ["/bin/bash", "/maxine-discovery-linux"]

