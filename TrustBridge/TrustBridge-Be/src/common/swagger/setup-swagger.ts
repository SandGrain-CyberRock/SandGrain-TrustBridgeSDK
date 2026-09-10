import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import {
    SWAGGER_CONSTANT,
    SWAGGER_TAGS,
} from "../constant";

export function setupSwagger(app: INestApplication): void {
    let configBuilder = new DocumentBuilder()
        .setTitle(SWAGGER_CONSTANT.TITLE)
        .setDescription(SWAGGER_CONSTANT.DESCRIPTION)
        .setVersion(SWAGGER_CONSTANT.VERSION)
        .setContact(
            SWAGGER_CONSTANT.CONTACT,
            SWAGGER_CONSTANT.CONTACT_EMAIL,
            "",
        )
        .addBearerAuth(
            SWAGGER_CONSTANT.BEARER_AUTH,
            SWAGGER_CONSTANT.BEARER_AUTH_NAME,
        );

    for (const tag of SWAGGER_TAGS) {
        configBuilder = configBuilder.addTag(tag.name, tag.description);
    }

    const document = SwaggerModule.createDocument(app, configBuilder.build());
    SwaggerModule.setup(SWAGGER_CONSTANT.DOCS_PATH, app, document, {
        swaggerOptions: SWAGGER_CONSTANT.OPTIONS,
        customSiteTitle: SWAGGER_CONSTANT.SITE_TITLE,
    });
}