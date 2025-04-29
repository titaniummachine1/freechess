const bestClassifications = [
    "brilliant",
    "great",
    "best",
    "book",
    "forced"
];

function updateClassificationMessage(lastPosition: Position, position: Position) {

    if (position.classification) {
        let classificationMessages: { [key: string]: string } = {
            "great": "a great move",
            "good":"an okay move",
            "inaccuracy": "an inaccuracy",
            "mistake": "a mistake",
            "blunder": "a blunder",
            "book": "theory"
        };

        $("#classification-icon").attr("src", `/static/media/${position.classification}.png`);

        let message = classificationMessages[position.classification] ?? position.classification;
        $("#classification-message").html(`${position.move?.san} is ${message}`);
        $("#classification-message").css("color", classificationColours[position.classification]);

        $("#classification-message-container").css("display", "flex");

        if (bestClassifications.includes(position.classification)) {
            $("#top-alternative-message").css("display", "none");
        } else {
            let topAlternative = lastPosition.topLines?.[0].moveSAN;
            if (!topAlternative) return;

            $("#top-alternative-message").html(`Best was ${topAlternative}`);
            $("#top-alternative-message").css("display", "inline");
        }
    } else {
        $("#classification-message-container").css("display", "none");
        $("#top-alternative-message").css("display", "none");
    }

}

$("#save-analysis-button").on("click", () => {

    let savedAnalysis = {
        players: {
            white: whitePlayer,
            black: blackPlayer
        },
        results: reportResults
    };

    let reportBlob = new Blob([JSON.stringify(savedAnalysis)], {"type": "application/json"});

    open(URL.createObjectURL(reportBlob));

});